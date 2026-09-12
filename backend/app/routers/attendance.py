"""Attendance router for FacePass.

Handles check-in and check-out with face matching, geofence validation,
and liveness detection.
"""

import logging
from uuid import UUID, uuid4
from datetime import datetime, timezone
from typing import Optional
import numpy as np

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status

from app.db.supabase import get_supabase_client
from app.routers.auth import get_current_user
from app.services.face_recognition import face_service
from app.services.geofence import validate_geofence, find_nearest_site
from app.services.liveness import generate_challenge, verify_challenge
from app.services.anti_spoofing import anti_spoof_service
from app.services.fraud_detector import fraud_detector
from app.services.template_updater import template_drift_service
from app.services.storage import upload_attendance_snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


@router.get("/challenge")
async def get_liveness_challenge(
    current_user: dict = Depends(get_current_user),
):
    """Generate a liveness challenge for the client to complete before check-in."""
    challenge = generate_challenge()
    return challenge


@router.get("/sites")
async def get_active_sites(
    current_user: dict = Depends(get_current_user),
):
    """Get active sites for the user's company to support dynamic geofence verification."""
    supabase = get_supabase_client()
    employee = current_user.get("employee")
    company_id = employee.get("company_id") if employee else None

    query = supabase.table("sites").select("*").eq("is_active", True)
    if company_id:
        query = query.eq("company_id", company_id)

    res = query.execute()
    return {"sites": res.data or []}


@router.post("/check-in")
async def check_in(
    image: UploadFile = File(..., description="Face image for recognition"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    challenge_id: Optional[str] = Form(None),
    device_fingerprint: Optional[str] = Form(None),
    client_uuid: Optional[str] = Form(None),
    offline_timestamp: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Process an employee check-in.

    Flow:
    1. Verify liveness challenge (if provided)
    2. Extract face embedding from image
    3. Match against enrolled employees
    4. Validate geofence (find nearest site)
    5. Compute composite trust score
    6. Log attendance record
    """
    supabase = get_supabase_client()

    try:
        # Check for duplicate (idempotency via client_uuid)
        if client_uuid:
            existing = (
                supabase.table("attendance_logs")
                .select("id")
                .eq("client_uuid", client_uuid)
                .execute()
            )
            if existing.data:
                return {"message": "Check-in already recorded", "id": existing.data[0]["id"]}

        # Step 1: Verify liveness
        liveness_score = 0.5  # Default if no challenge
        if challenge_id and not challenge_id.startswith("passive"):
            is_valid, liveness_score = verify_challenge(challenge_id)
            if not is_valid:
                if client_uuid:
                    # Offline sync: challenge was performed locally offline or expired during connectivity loss.
                    # Passive anti-spoofing (FFT moiré + chrominance) evaluates the frame for physical liveness.
                    logger.info("Offline sync %s: challenge expired or offline, falling back to passive anti-spoofing.", client_uuid)
                    liveness_score = 0.6
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Liveness challenge failed or expired. Please try again.",
                    )
        elif challenge_id and challenge_id.startswith("passive"):
            liveness_score = 0.95

        # Step 2: Extract face embedding
        if not face_service.is_available:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Face recognition service not available",
            )

        image_bytes = await image.read()
        target_embedding = face_service.extract_embedding(image_bytes)

        if target_embedding is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No face detected in the image. Please try again.",
            )

        # Step 3: 1:1 Biometric Verification against authenticated employee
        # Get the current user's employee record
        employee = current_user.get("employee")
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee profile not found",
            )

        # Fetch embeddings specifically for this employee
        user_embeddings = (
            supabase.table("embeddings")
            .select("id, employee_id, embedding")
            .eq("employee_id", employee["id"])
            .eq("is_active", True)
            .execute()
        )

        if not user_embeddings.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No face embeddings found. Please complete face enrollment first.",
            )

        # Match face against employee's enrolled templates
        match_result = face_service.find_best_match(
            target_embedding, user_embeddings.data, threshold=0.6
        )

        if match_result is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Face not recognized. Please face the camera clearly and try again.",
            )

        matched_employee_id, face_confidence = match_result

        # Step 4: Validate geofence
        sites = (
            supabase.table("sites")
            .select("*")
            .eq("company_id", employee["company_id"])
            .eq("is_active", True)
            .execute()
        )

        nearest_site = None
        geofence_distance = None
        geofence_valid = False

        if sites.data:
            nearest_site = find_nearest_site(latitude, longitude, sites.data)
            if nearest_site:
                geofence_valid = True
                geofence_distance = nearest_site["distance_meters"]

        # Step 5: Advanced ML Analysis (Anti-Spoofing & Behavioral Fraud Engine)
        anti_spoof_res = anti_spoof_service.analyze_frame(image_bytes)

        fraud_eval = fraud_detector.evaluate_checkin(
            supabase_client=supabase,
            company_id=employee["company_id"],
            employee_id=matched_employee_id,
            latitude=latitude,
            longitude=longitude,
            device_fingerprint=device_fingerprint,
        )

        # Step 6: Compute intelligent trust score (0-100)
        trust_score = _compute_trust_score(
            face_confidence=face_confidence,
            spoof_score=anti_spoof_res.spoof_score,
            liveness_score=liveness_score,
            geofence_valid=geofence_valid,
            impossible_travel=fraud_eval.impossible_travel,
            collusion=fraud_eval.collusion_detected,
        )

        # Determine status & flag reasons
        attendance_status = "verified"
        flag_reasons = []

        if not anti_spoof_res.is_real:
            attendance_status = "flagged"
            flag_reasons.append(anti_spoof_res.flag_reason or "Presentation attack suspected")

        if fraud_eval.is_flagged:
            attendance_status = "flagged"
            if fraud_eval.reason:
                flag_reasons.append(fraud_eval.reason)

        if trust_score < 55:
            attendance_status = "flagged"
            if face_confidence < 0.65:
                flag_reasons.append("Low face match confidence")
            if not geofence_valid:
                flag_reasons.append("Outside geofence")

        flag_reason = "; ".join(flag_reasons) if flag_reasons else None

        # Step 7: Log attendance with ML metrics and audit snapshot
        log_id = str(uuid4())
        image_url = upload_attendance_snapshot(image_bytes, log_id)

        checked_at_ts = datetime.now(timezone.utc).isoformat()
        if offline_timestamp:
            try:
                parsed_ts = datetime.fromisoformat(offline_timestamp.replace("Z", "+00:00"))
                now_utc = datetime.now(timezone.utc)
                age_days = (now_utc - parsed_ts).total_seconds() / 86400
                if -0.01 <= age_days <= 14:
                    checked_at_ts = parsed_ts.isoformat()
                    logger.info("Preserving offline capture timestamp: %s", checked_at_ts)
            except Exception as ts_err:
                logger.warning("Could not parse offline_timestamp %s: %s", offline_timestamp, ts_err)

        log_data = {
            "id": log_id,
            "employee_id": matched_employee_id,
            "site_id": nearest_site["id"] if nearest_site else None,
            "check_type": "check_in",
            "checked_at": checked_at_ts,
            "latitude": latitude,
            "longitude": longitude,
            "geofence_distance_meters": geofence_distance,
            "face_match_confidence": round(face_confidence, 4),
            "liveness_score": round(liveness_score, 4),
            "trust_score": round(trust_score, 2),
            "status": attendance_status,
            "flag_reason": flag_reason,
            "device_fingerprint": device_fingerprint,
            "client_uuid": client_uuid or str(uuid4()),
        }

        # Optional columns for ML auditing and session continuity
        optional_cols = {
            "spoof_score": round(anti_spoof_res.spoof_score, 4),
            "anomaly_score": round(fraud_eval.anomaly_score, 4),
            "impossible_travel_flag": fraud_eval.impossible_travel,
            "collusion_flag": fraud_eval.collusion_detected,
            "image_url": image_url,
            "face_embedding": target_embedding.tolist(),
        }

        # Try with all columns first; if it fails, retry without optional ones
        full_log_data = {**log_data, **optional_cols}
        try:
            result = supabase.table("attendance_logs").insert(full_log_data).execute()
        except Exception as insert_err:
            logger.warning("Full insert failed (%s), retrying with core columns only.", insert_err)
            result = supabase.table("attendance_logs").insert(log_data).execute()

        attendance_id = result.data[0]["id"] if result.data else log_id

        # Step 8: Trigger security alert if fraud or presentation attack detected
        if attendance_id and (fraud_eval.is_flagged or not anti_spoof_res.is_real):
            alert_type = fraud_eval.alert_type or "spoof_attack"
            severity = fraud_eval.severity if fraud_eval.is_flagged else "high"
            alert_details = {
                "anti_spoof": anti_spoof_res.metrics,
                "fraud": fraud_eval.details,
                "trust_score": trust_score,
                "flag_reason": flag_reason,
            }
            fraud_detector.record_fraud_alert(
                supabase_client=supabase,
                company_id=employee["company_id"],
                employee_id=matched_employee_id,
                attendance_id=attendance_id,
                alert_type=alert_type,
                severity=severity,
                details=alert_details,
            )

        # Step 9: Continuous learning & biometric drift adaptation
        if attendance_status == "verified" and target_embedding is not None:
            template_drift_service.consider_drift_update(
                supabase_client=supabase,
                employee_id=matched_employee_id,
                new_embedding=target_embedding,
                match_confidence=face_confidence,
                spoof_score=anti_spoof_res.spoof_score,
                geofence_valid=geofence_valid,
            )

        return {
            "message": "Check-in recorded successfully",
            "attendance_id": result.data[0]["id"] if result.data else None,
            "employee_id": matched_employee_id,
            "site": nearest_site["name"] if nearest_site else None,
            "trust_score": round(trust_score, 2),
            "status": attendance_status,
            "checked_at": log_data["checked_at"],
        }

    except HTTPException:
        raise  # Re-raise FastAPI HTTP exceptions as-is
    except Exception as exc:
        logger.exception("Unhandled error in check-in: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Check-in processing error: {str(exc)}",
        )


@router.post("/check-out")
async def check_out(
    image: UploadFile = File(..., description="Face image for recognition"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    challenge_id: Optional[str] = Form(None),
    device_fingerprint: Optional[str] = Form(None),
    client_uuid: Optional[str] = Form(None),
    offline_timestamp: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Process an employee check-out. Same flow as check-in but logged as check_out."""
    supabase = get_supabase_client()

    try:
        # Reuse check-in logic but with check_type = "check_out"
        if client_uuid:
            existing = (
                supabase.table("attendance_logs")
                .select("id")
                .eq("client_uuid", client_uuid)
                .execute()
            )
            if existing.data:
                return {"message": "Check-out already recorded", "id": existing.data[0]["id"]}

        # Liveness
        liveness_score = 0.5
        if challenge_id and not challenge_id.startswith("passive"):
            is_valid, liveness_score = verify_challenge(challenge_id)
            if not is_valid:
                if client_uuid:
                    logger.info("Offline sync %s: challenge expired or offline in check_out.", client_uuid)
                    liveness_score = 0.6
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Liveness challenge failed",
                    )
        elif challenge_id and challenge_id.startswith("passive"):
            liveness_score = 0.95

        # Face matching
        if not face_service.is_available:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Face recognition service not available",
            )

        image_bytes = await image.read()
        target_embedding = face_service.extract_embedding(image_bytes)

        if target_embedding is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No face detected",
            )

        employee = current_user.get("employee")
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        # Get employee's own embeddings for verification
        embeddings = (
            supabase.table("embeddings")
            .select("id, employee_id, embedding")
            .eq("employee_id", employee["id"])
            .eq("is_active", True)
            .execute()
        )

        if not embeddings.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Not enrolled. Please complete enrollment first.",
            )

        # Verification 1: Master Biometric Identity Match (against enrolled templates)
        match_result = face_service.find_best_match(
            target_embedding, embeddings.data, threshold=0.6
        )

        if match_result is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Face not recognized against enrolled profile. Please ensure proper lighting and face the camera.",
            )

        _, master_confidence = match_result
        master_resemblance_pct = round(master_confidence * 100, 1)

        # Verification 2: ML Session Continuity Triangulation (Compare against today's check-in face)
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        checkin_res = (
            supabase.table("attendance_logs")
            .select("id, face_embedding, checked_at, image_url")
            .eq("employee_id", employee["id"])
            .eq("check_type", "check_in")
            .gte("checked_at", today_start)
            .order("checked_at", desc=True)
            .limit(1)
            .execute()
        )

        session_match_score = None
        matched_check_in_id = None
        checkout_status = "verified"
        flag_reason = None

        if checkin_res.data and len(checkin_res.data) > 0:
            checkin_log = checkin_res.data[0]
            matched_check_in_id = checkin_log.get("id")
            checkin_emb = checkin_log.get("face_embedding")

            if checkin_emb:
                try:
                    checkin_vec = np.array(checkin_emb, dtype=np.float32)
                    sim = face_service.compare_embeddings(target_embedding, checkin_vec)
                    session_match_score = round(float(sim) * 100, 1)

                    # If check-out face deviates from morning check-in face (< 65% cosine resemblance)
                    if sim < 0.65:
                        checkout_status = "flagged"
                        flag_reason = (
                            f"Buddy Punching Impersonation Anomaly: Check-out face does not match "
                            f"morning check-in face ({session_match_score}% resemblance)."
                        )
                        logger.warning(
                            "Buddy punching detected for employee %s: session resemblance %s%%",
                            employee["id"],
                            session_match_score,
                        )
                except Exception as comp_err:
                    logger.warning("Error comparing check-in and check-out embeddings: %s", comp_err)

        trust_score = _compute_trust_score(
            master_confidence,
            1.0 if checkout_status == "verified" else 0.4,
            0.9,
            checkout_status == "verified",
        )

        log_id = str(uuid4())
        image_url = upload_attendance_snapshot(image_bytes, log_id)

        checked_at_ts = datetime.now(timezone.utc).isoformat()
        if offline_timestamp:
            try:
                parsed_ts = datetime.fromisoformat(offline_timestamp.replace("Z", "+00:00"))
                now_utc = datetime.now(timezone.utc)
                age_days = (now_utc - parsed_ts).total_seconds() / 86400
                if -0.01 <= age_days <= 14:
                    checked_at_ts = parsed_ts.isoformat()
                    logger.info("Preserving offline checkout capture timestamp: %s", checked_at_ts)
            except Exception as ts_err:
                logger.warning("Could not parse checkout offline_timestamp %s: %s", offline_timestamp, ts_err)

        log_data = {
            "id": log_id,
            "employee_id": employee["id"],
            "check_type": "check_out",
            "checked_at": checked_at_ts,
            "latitude": latitude,
            "longitude": longitude,
            "face_match_confidence": round(master_confidence, 4),
            "liveness_score": round(liveness_score, 4),
            "trust_score": round(trust_score, 2),
            "status": checkout_status,
            "flag_reason": flag_reason,
            "device_fingerprint": device_fingerprint,
            "client_uuid": client_uuid or str(uuid4()),
        }

        optional_cols = {
            "image_url": image_url,
            "face_embedding": target_embedding.tolist(),
            "session_match_score": session_match_score,
            "matched_check_in_id": matched_check_in_id,
        }

        full_log_data = {**log_data, **optional_cols}

        # Try with all columns first; fallback if optional column omitted
        try:
            result = supabase.table("attendance_logs").insert(full_log_data).execute()
        except Exception as insert_err:
            logger.warning("Full check-out insert failed (%s), retrying core...", insert_err)
            result = supabase.table("attendance_logs").insert({**log_data, "image_url": image_url}).execute()

        # Trigger fraud alert if buddy punching detected
        if checkout_status == "flagged":
            try:
                fraud_detector.record_fraud_alert(
                    supabase_client=supabase,
                    company_id=employee["company_id"],
                    employee_id=employee["id"],
                    alert_type="buddy_punching",
                    severity="critical",
                    risk_score=95.0,
                    details={
                        "master_resemblance_pct": master_resemblance_pct,
                        "session_resemblance_pct": session_match_score,
                        "matched_check_in_id": matched_check_in_id,
                        "flag_reason": flag_reason,
                    },
                    attendance_id=log_id,
                )
            except Exception as alert_err:
                logger.warning("Could not record buddy punching fraud alert: %s", alert_err)

        return {
            "message": (
                "Check-out verified successfully"
                if checkout_status == "verified"
                else "Check-out logged with security flag (identity review required)"
            ),
            "attendance_id": result.data[0]["id"] if result.data else log_id,
            "trust_score": round(trust_score, 2),
            "master_resemblance_score": master_resemblance_pct,
            "session_resemblance_score": session_match_score,
            "status": checkout_status,
            "checked_at": log_data["checked_at"],
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled error in check-out: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Check-out processing error: {str(exc)}",
        )


@router.get("/")
async def list_attendance(
    page: int = 1,
    limit: int = 20,
    employee_id: Optional[str] = None,
    site_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List attendance logs with pagination and filters."""
    supabase = get_supabase_client()
    offset = (page - 1) * limit

    query = supabase.table("attendance_logs").select("*", count="exact")

    if employee_id:
        query = query.eq("employee_id", employee_id)
    if site_id:
        query = query.eq("site_id", site_id)
    if date_from:
        query = query.gte("checked_at", date_from)
    if date_to:
        query = query.lte("checked_at", date_to)

    response = query.range(offset, offset + limit - 1).order("checked_at", desc=True).execute()

    return {
        "items": response.data or [],
        "total": response.count or 0,
        "page": page,
        "limit": limit,
    }


@router.get("/my-history")
async def get_my_history(
    limit: int = 30,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve personal attendance history and stats for the authenticated employee."""
    supabase = get_supabase_client()
    employee = current_user.get("employee")
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    logs_res = (
        supabase.table("attendance_logs")
        .select("*, sites(name)")
        .eq("employee_id", employee["id"])
        .order("checked_at", desc=True)
        .limit(limit)
        .execute()
    )

    logs = logs_res.data or []
    verified_count = sum(1 for l in logs if l.get("status") == "verified")
    total_punches = len(logs)
    verified_rate = round((verified_count / total_punches) * 100, 1) if total_punches > 0 else 100.0

    return {
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "employee_code": employee.get("employee_code"),
        "verified_rate": verified_rate,
        "total_punches": total_punches,
        "items": logs,
        "logs": logs,
    }


@router.get("/{log_id}")
async def get_attendance_log(
    log_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Get a single attendance log by ID."""
    supabase = get_supabase_client()

    response = (
        supabase.table("attendance_logs")
        .select("*")
        .eq("id", str(log_id))
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Attendance log not found")

    return response.data


@router.post("/kiosk-punch")
async def kiosk_punch(
    image: UploadFile = File(..., description="Worker face photo from kiosk webcam"),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    site_id: Optional[str] = Form(None),
    mode: Optional[str] = Form("auto"),
    device_fingerprint: Optional[str] = Form(None),
):
    """Entrance Kiosk mode: Zero-touch 1:N attendance scanning for reception tablets.

    Identifies any worker enrolled in the company from a single webcam snapshot,
    resolves morning check-in vs evening check-out automatically, evaluates session continuity,
    and logs the punch in under 500ms.
    """
    supabase = get_supabase_client()

    if not face_service.is_available:
        return {
            "success": False,
            "recognized": False,
            "error_code": "SERVICE_UNAVAILABLE",
            "message": "Biometric face recognition engine is currently initializing.",
        }

    # 1. Resolve Active Site & Company
    active_site = None
    if site_id:
        s_res = supabase.table("sites").select("*").eq("id", site_id).execute()
        if s_res.data and len(s_res.data) > 0:
            active_site = s_res.data[0]

    if not active_site:
        s_res = supabase.table("sites").select("*").eq("is_active", True).limit(1).execute()
        if s_res.data and len(s_res.data) > 0:
            active_site = s_res.data[0]

    company_id = active_site["company_id"] if active_site else "c0000000-0000-0000-0000-000000000001"

    # Default coordinates to active site if tablet GPS is disabled
    site_lat = active_site.get("latitude", 31.6393467) if active_site else 31.6393467
    site_lng = active_site.get("longitude", -8.0095983) if active_site else -8.0095983
    punch_lat = float(latitude) if latitude is not None and float(latitude) != 0.0 else site_lat
    punch_lng = float(longitude) if longitude is not None and float(longitude) != 0.0 else site_lng

    # 2. Extract 512D ArcFace embedding
    image_bytes = await image.read()
    target_embedding = face_service.extract_embedding(image_bytes)

    if target_embedding is None:
        return {
            "success": False,
            "recognized": False,
            "error_code": "NO_FACE_DETECTED",
            "message": "No face detected. Please position your face inside the biometric oval.",
        }

    # 3. 1:N search across all enrolled active employees
    emp_res = (
        supabase.table("employees")
        .select("id, first_name, last_name, employee_code, email, avatar_url, company_id")
        .eq("company_id", company_id)
        .eq("is_enrolled", True)
        .eq("is_active", True)
        .execute()
    )

    if not emp_res.data or len(emp_res.data) == 0:
        return {
            "success": False,
            "recognized": False,
            "error_code": "NO_ENROLLED_STAFF",
            "message": "No enrolled employees found for this facility.",
        }

    emp_ids = [e["id"] for e in emp_res.data]
    emp_map = {e["id"]: e for e in emp_res.data}

    embeddings_res = (
        supabase.table("embeddings")
        .select("id, employee_id, embedding")
        .in_("employee_id", emp_ids)
        .eq("is_active", True)
        .execute()
    )

    if not embeddings_res.data or len(embeddings_res.data) == 0:
        return {
            "success": False,
            "recognized": False,
            "error_code": "NO_EMBEDDINGS",
            "message": "No biometric templates found for this facility.",
        }

    match = face_service.find_best_match(target_embedding, embeddings_res.data, threshold=0.60)
    if not match:
        return {
            "success": False,
            "recognized": False,
            "error_code": "FACE_NOT_RECOGNIZED",
            "message": "Face not recognized. Please face the camera directly or contact HR to enroll.",
        }

    matched_emp_id, face_confidence = match
    matched_employee = emp_map.get(matched_emp_id)

    # 4. Geofence validation
    geofence_valid = True
    geofence_distance = 15.0
    if active_site and active_site.get("latitude"):
        geofence_valid, geofence_distance = validate_geofence(
            punch_lat, punch_lng, active_site["latitude"], active_site["longitude"], active_site.get("radius_meters", 150)
        )

    # 5. Passive Anti-Spoofing & Trust Score
    anti_spoof_res = anti_spoof_service.analyze_frame(image_bytes)
    trust_score = _compute_trust_score(
        face_confidence=face_confidence,
        spoof_score=anti_spoof_res.spoof_score,
        liveness_score=0.95 if anti_spoof_res.is_real else 0.4,
        geofence_valid=geofence_valid,
    )
    status_str = "verified" if (trust_score >= 60 and anti_spoof_res.is_real) else "flagged"

    # 6. Auto Check-Type resolution (check_in vs check_out)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
    last_punch = (
        supabase.table("attendance_logs")
        .select("id, check_type, face_embedding")
        .eq("employee_id", matched_emp_id)
        .gte("checked_at", today_start)
        .order("checked_at", desc=True)
        .limit(1)
        .execute()
    )

    if mode == "check_in":
        next_type = "check_in"
    elif mode == "check_out":
        next_type = "check_out"
    else:
        # "auto" mode: toggle based on last punch today
        next_type = "check_out" if (last_punch.data and last_punch.data[0]["check_type"] == "check_in") else "check_in"

    # 7. Session continuity verification for check_out
    session_match_score = None
    matched_check_in_id = None
    if next_type == "check_out":
        if last_punch.data and last_punch.data[0]["check_type"] == "check_in":
            matched_check_in_id = last_punch.data[0]["id"]
            morning_emb = last_punch.data[0].get("face_embedding")
            if morning_emb:
                try:
                    morning_np = np.array(morning_emb, dtype=np.float32)
                    session_match_score = round(face_service.compare_embeddings(target_embedding, morning_np), 4)
                except Exception:
                    session_match_score = round(face_confidence, 4)
            else:
                session_match_score = round(face_confidence, 4)
        else:
            session_match_score = round(face_confidence, 4)

    # 8. Persist snapshot and attendance log
    log_id = str(uuid4())
    image_url = upload_attendance_snapshot(image_bytes, log_id)

    log_data = {
        "id": log_id,
        "employee_id": matched_emp_id,
        "site_id": active_site["id"] if active_site else None,
        "check_type": next_type,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "latitude": punch_lat,
        "longitude": punch_lng,
        "geofence_distance_meters": round(geofence_distance, 1),
        "face_match_confidence": round(face_confidence, 4),
        "liveness_score": 0.95 if anti_spoof_res.is_real else 0.4,
        "spoof_score": round(anti_spoof_res.spoof_score, 4),
        "anomaly_score": 0.0,
        "trust_score": round(trust_score, 2),
        "status": status_str,
        "flag_reason": anti_spoof_res.flag_reason if not anti_spoof_res.is_real else None,
        "image_url": image_url,
        "face_embedding": target_embedding.tolist() if hasattr(target_embedding, "tolist") else None,
        "session_match_score": session_match_score,
        "matched_check_in_id": matched_check_in_id,
        "device_fingerprint": device_fingerprint or "kiosk-tablet-terminal",
        "client_uuid": str(uuid4()),
    }
    supabase.table("attendance_logs").insert(log_data).execute()

    now_formatted = datetime.now().strftime("%I:%M %p")
    action_text = "Check-in recorded" if next_type == "check_in" else "Check-out recorded"
    greeting = f"Welcome, {matched_employee['first_name']}!" if next_type == "check_in" else f"Goodbye, {matched_employee['first_name']}!"

    return {
        "success": True,
        "recognized": True,
        "employee": {
            "id": matched_emp_id,
            "name": f"{matched_employee['first_name']} {matched_employee['last_name']}".strip(),
            "first_name": matched_employee["first_name"],
            "last_name": matched_employee["last_name"],
            "employee_code": matched_employee.get("employee_code", "FP-ID"),
            "avatar_url": matched_employee.get("avatar_url") or image_url,
        },
        "punch": {
            "id": log_id,
            "check_type": next_type,
            "time": now_formatted,
            "confidence": round(face_confidence * 100, 1),
            "trust_score": round(trust_score, 1),
            "session_match_score": round(session_match_score * 100, 1) if session_match_score else None,
            "status": status_str,
            "site_name": active_site["name"] if active_site else "Marrakesh Hub",
            "image_url": image_url,
        },
        "message": f"{greeting} {action_text} at {now_formatted}.",
    }


def _compute_trust_score(
    face_confidence: float,
    spoof_score: float,
    liveness_score: float,
    geofence_valid: bool,
    impossible_travel: bool = False,
    collusion: bool = False,
) -> float:
    """Compute an intelligent composite trust score (0-100).

    Weighted contributions:
    - Face match confidence: 35%
    - Passive anti-spoofing / presentation attack defense: 25%
    - Dynamic challenge liveness: 15%
    - Geofence validity: 25%

    Fraud Penalties:
    - Impossible travel detected: -30 points
    - Pass-the-phone collusion: -25 points
    """
    face_component = min(1.0, max(0.0, face_confidence)) * 35.0
    spoof_component = min(1.0, max(0.0, spoof_score)) * 25.0
    liveness_component = min(1.0, max(0.0, liveness_score)) * 15.0
    geofence_component = 25.0 if geofence_valid else 0.0

    score = face_component + spoof_component + liveness_component + geofence_component

    if impossible_travel:
        score -= 30.0
    if collusion:
        score -= 25.0

    return round(max(0.0, min(100.0, score)), 2)
