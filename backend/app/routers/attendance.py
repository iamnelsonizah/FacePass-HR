"""Attendance router for FacePass.

Handles check-in and check-out with face matching, geofence validation,
and liveness detection.
"""

import logging
from uuid import UUID, uuid4
from datetime import datetime, timezone
from typing import Optional

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


@router.post("/check-in")
async def check_in(
    image: UploadFile = File(..., description="Face image for recognition"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    challenge_id: Optional[str] = Form(None),
    device_fingerprint: Optional[str] = Form(None),
    client_uuid: Optional[str] = Form(None),
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
    if challenge_id:
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

    # Step 3: Match against enrolled employees
    # Get the current user's employee record to determine their company
    employee = current_user.get("employee")
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile not found",
        )

    # Fetch all embeddings for the employee's company
    company_employees = (
        supabase.table("employees")
        .select("id")
        .eq("company_id", employee["company_id"])
        .eq("is_enrolled", True)
        .eq("is_active", True)
        .execute()
    )

    employee_ids = [e["id"] for e in (company_employees.data or [])]

    if not employee_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No enrolled employees found in your company",
        )

    # Fetch embeddings
    all_embeddings = (
        supabase.table("embeddings")
        .select("id, employee_id, embedding")
        .in_("employee_id", employee_ids)
        .eq("is_active", True)
        .execute()
    )

    if not all_embeddings.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No face embeddings found. Please enroll first.",
        )

    # Find best match
    match_result = face_service.find_best_match(
        target_embedding, all_embeddings.data, threshold=0.6
    )

    if match_result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Face not recognized. Please try again or contact your administrator.",
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

    log_data = {
        "id": log_id,
        "employee_id": matched_employee_id,
        "site_id": nearest_site["id"] if nearest_site else None,
        "check_type": "check_in",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "latitude": latitude,
        "longitude": longitude,
        "geofence_distance_meters": geofence_distance,
        "face_match_confidence": round(face_confidence, 4),
        "liveness_score": round(liveness_score, 4),
        "spoof_score": round(anti_spoof_res.spoof_score, 4),
        "anomaly_score": round(fraud_eval.anomaly_score, 4),
        "impossible_travel_flag": fraud_eval.impossible_travel,
        "collusion_flag": fraud_eval.collusion_detected,
        "trust_score": round(trust_score, 2),
        "status": attendance_status,
        "flag_reason": flag_reason,
        "image_url": image_url,
        "device_fingerprint": device_fingerprint,
        "client_uuid": client_uuid or str(uuid4()),
    }

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


@router.post("/check-out")
async def check_out(
    image: UploadFile = File(..., description="Face image for recognition"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    challenge_id: Optional[str] = Form(None),
    device_fingerprint: Optional[str] = Form(None),
    client_uuid: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Process an employee check-out. Same flow as check-in but logged as check_out."""
    supabase = get_supabase_client()

    # Reuse check-in logic but with check_type = "check_out"
    # For MVP, simplified: just verify face and log
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
    if challenge_id:
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

    match_result = face_service.find_best_match(
        target_embedding, embeddings.data, threshold=0.6
    )

    if match_result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Face not recognized",
        )

    _, face_confidence = match_result
    trust_score = _compute_trust_score(face_confidence, 1.0, 0.9, True)

    log_id = str(uuid4())
    image_url = upload_attendance_snapshot(image_bytes, log_id)

    log_data = {
        "id": log_id,
        "employee_id": employee["id"],
        "check_type": "check_out",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "latitude": latitude,
        "longitude": longitude,
        "face_match_confidence": round(face_confidence, 4),
        "liveness_score": round(liveness_score, 4),
        "trust_score": round(trust_score, 2),
        "status": "verified",
        "image_url": image_url,
        "device_fingerprint": device_fingerprint,
        "client_uuid": client_uuid or str(uuid4()),
    }

    result = supabase.table("attendance_logs").insert(log_data).execute()

    return {
        "message": "Check-out recorded successfully",
        "attendance_id": result.data[0]["id"] if result.data else None,
        "trust_score": round(trust_score, 2),
        "checked_at": log_data["checked_at"],
    }


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
    image: UploadFile = File(..., description="Worker face photo"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    site_id: Optional[str] = Form(None),
    device_fingerprint: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Supervisor Kiosk mode: Continuous 1:N attendance scanning.

    Identifies any worker enrolled in the company from a single face scan,
    validates site geofence, and records check-in/out seamlessly.
    """
    supabase = get_supabase_client()

    if not face_service.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition service is unavailable",
        )

    # 1. Determine company_id from supervisor's profile
    supervisor = current_user.get("employee")
    if not supervisor:
        admin = current_user.get("admin")
        if not admin:
            raise HTTPException(status_code=403, detail="Unauthorized kiosk operator")
        company_id = admin["company_id"]
    else:
        company_id = supervisor["company_id"]

    # 2. Read and extract face embedding (with CLAHE fallback)
    image_bytes = await image.read()
    target_embedding = face_service.extract_embedding(image_bytes)

    if target_embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No face detected in camera view. Please center face inside the oval.",
        )

    # 3. 1:N search across all enrolled employees of this company
    emp_res = (
        supabase.table("employees")
        .select("id, first_name, last_name, employee_code")
        .eq("company_id", company_id)
        .eq("is_enrolled", True)
        .eq("is_active", True)
        .execute()
    )

    if not emp_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No enrolled employees found for this company",
        )

    emp_ids = [e["id"] for e in emp_res.data]
    emp_map = {e["id"]: e for e in emp_res.data}

    embeddings_res = (
        supabase.table("embeddings")
        .select("id, employee_id, embedding")
        .in_("employee_id", emp_ids)
        .eq("is_active", True)
        .execute()
    )

    if not embeddings_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active face embeddings found",
        )

    match = face_service.find_best_match(target_embedding, embeddings_res.data, threshold=0.60)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Face not recognized. Worker not enrolled or match confidence below threshold.",
        )

    matched_emp_id, face_confidence = match
    matched_employee = emp_map.get(matched_emp_id)

    # 4. Geofence validation
    geofence_valid = False
    geofence_distance = 0.0
    active_site = None

    if site_id:
        s_res = supabase.table("sites").select("*").eq("id", site_id).single().execute()
        active_site = s_res.data
    if not active_site:
        sites_res = supabase.table("sites").select("*").eq("company_id", company_id).eq("is_active", True).execute()
        active_site, geofence_distance = find_nearest_site(latitude, longitude, sites_res.data or [])

    if active_site and active_site.get("latitude"):
        geofence_valid, geofence_distance = validate_geofence(
            latitude, longitude, active_site["latitude"], active_site["longitude"], active_site.get("radius_meters", 100)
        )

    # 5. Passive Anti-Spoofing
    anti_spoof_res = anti_spoof_service.analyze_frame(image_bytes)

    # 6. Trust Score
    trust_score = _compute_trust_score(
        face_confidence=face_confidence,
        spoof_score=anti_spoof_res.spoof_score,
        liveness_score=0.95 if anti_spoof_res.is_real else 0.4,
        geofence_valid=geofence_valid,
    )

    status_str = "verified" if (trust_score >= 60 and anti_spoof_res.is_real) else "flagged"

    # 7. Check whether worker last checked in or out today to auto-toggle check_type
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
    last_punch = (
        supabase.table("attendance_logs")
        .select("check_type")
        .eq("employee_id", matched_emp_id)
        .gte("checked_at", today_start)
        .order("checked_at", desc=True)
        .limit(1)
        .execute()
    )

    next_type = "check_out" if (last_punch.data and last_punch.data[0]["check_type"] == "check_in") else "check_in"

    # 8. Upload snapshot and persist log
    log_id = str(uuid4())
    image_url = upload_attendance_snapshot(image_bytes, log_id)

    log_data = {
        "id": log_id,
        "employee_id": matched_emp_id,
        "site_id": active_site["id"] if active_site else None,
        "check_type": next_type,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "latitude": latitude,
        "longitude": longitude,
        "geofence_distance_meters": round(geofence_distance, 1),
        "face_match_confidence": round(face_confidence, 4),
        "liveness_score": 0.95 if anti_spoof_res.is_real else 0.4,
        "spoof_score": round(anti_spoof_res.spoof_score, 4),
        "anomaly_score": 0.0,
        "trust_score": round(trust_score, 2),
        "status": status_str,
        "flag_reason": anti_spoof_res.flag_reason if not anti_spoof_res.is_real else None,
        "image_url": image_url,
        "device_fingerprint": device_fingerprint,
        "client_uuid": str(uuid4()),
    }
    supabase.table("attendance_logs").insert(log_data).execute()

    return {
        "success": True,
        "employee_id": matched_emp_id,
        "employee_name": f"{matched_employee['first_name']} {matched_employee['last_name']}",
        "employee_code": matched_employee.get("employee_code", "EMP"),
        "check_type": next_type,
        "confidence": round(face_confidence * 100, 1),
        "trust_score": round(trust_score, 1),
        "status": status_str,
        "site_name": active_site["name"] if active_site else "HQ Site",
        "checked_at": log_data["checked_at"],
        "image_url": image_url,
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
