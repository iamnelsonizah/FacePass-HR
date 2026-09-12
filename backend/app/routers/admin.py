"""Admin router for FacePass.

Provides read-only endpoints for the admin dashboard to fetch
statistics, employee data, and attendance logs.
"""

import csv
import io
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response

from app.db.supabase import get_supabase_client
from app.routers.auth import get_current_user
from app.services.email import send_hr_attendance_digest

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/stats")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
):
    """Get dashboard statistics.

    Returns:
        - Total employees
        - Today's check-ins
        - Active sites
        - Flagged check-ins (today)
    """
    supabase = get_supabase_client()
    employee = current_user.get("employee")

    # For admin, we could check admin_users table. For MVP, use employee's company.
    company_id = employee["company_id"] if employee else None

    # Total employees
    employees_resp = (
        supabase.table("employees")
        .select("id", count="exact")
        .eq("company_id", company_id)
        .eq("is_active", True)
        .execute()
    )

    # Today's date range (UTC)
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today_end = today_start + timedelta(days=1)

    # Today's check-ins
    checkins_resp = (
        supabase.table("attendance_logs")
        .select("id", count="exact")
        .eq("check_type", "check_in")
        .gte("checked_at", today_start.isoformat())
        .lt("checked_at", today_end.isoformat())
        .execute()
    )

    # Active sites
    sites_resp = (
        supabase.table("sites")
        .select("id", count="exact")
        .eq("company_id", company_id)
        .eq("is_active", True)
        .execute()
    )
    # Flagged check-ins (today)
    flagged_resp = (
        supabase.table("attendance_logs")
        .select("id", count="exact")
        .eq("status", "flagged")
        .gte("checked_at", today_start.isoformat())
        .lt("checked_at", today_end.isoformat())
        .execute()
    )

    def get_count(resp):
        if getattr(resp, "count", None) is not None:
            return resp.count
        return len(resp.data) if resp.data else 0

    return {
        "total_employees": get_count(employees_resp),
        "todays_checkins": get_count(checkins_resp),
        "active_sites": get_count(sites_resp),
        "flagged_checkins": get_count(flagged_resp),
    }


@router.get("/employees")
async def admin_list_employees(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List all employees for admin dashboard with search."""
    supabase = get_supabase_client()
    offset = (page - 1) * limit

    employee = current_user.get("employee")
    company_id = employee["company_id"] if employee else None

    query = (
        supabase.table("employees")
        .select("*", count="exact")
        .eq("company_id", company_id)
    )

    if search:
        # Search by name or email
        query = query.or_(
            f"first_name.ilike.%{search}%,"
            f"last_name.ilike.%{search}%,"
            f"email.ilike.%{search}%"
        )

    response = (
        query.range(offset, offset + limit - 1)
        .order("created_at", desc=True)
        .execute()
    )

    return {
        "items": response.data or [],
        "total": response.count or 0,
        "page": page,
        "limit": limit,
    }


@router.get("/attendance")
async def admin_list_attendance(
    page: int = 1,
    limit: int = 20,
    employee_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List attendance logs for admin dashboard with filters."""
    supabase = get_supabase_client()
    offset = (page - 1) * limit

    # Join with employees to get names
    query = supabase.table("attendance_logs").select(
        "*, employees(first_name, last_name, email)",
        count="exact",
    )

    if employee_id:
        query = query.eq("employee_id", employee_id)
    if status_filter:
        query = query.eq("status", status_filter)
    if date_from:
        query = query.gte("checked_at", date_from)
    if date_to:
        query = query.lte("checked_at", date_to)

    response = (
        query.range(offset, offset + limit - 1)
        .order("checked_at", desc=True)
        .execute()
    )

    return {
        "items": response.data or [],
        "total": response.count or 0,
        "page": page,
        "limit": limit,
    }


@router.get("/fraud-alerts")
async def get_fraud_alerts(
    resolved: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """List active or resolved fraud alerts."""
    supabase = get_supabase_client()
    employee = current_user.get("employee")
    company_id = employee["company_id"] if employee else None

    query = (
        supabase.table("fraud_alerts")
        .select("*, employees(first_name, last_name, email)")
        .order("created_at", desc=True)
    )

    if company_id:
        query = query.eq("company_id", company_id)

    query = query.eq("is_resolved", resolved)
    response = query.limit(50).execute()
    return {"alerts": response.data or []}


@router.post("/fraud-alerts/{alert_id}/resolve")
async def resolve_fraud_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Mark a security fraud alert as resolved."""
    supabase = get_supabase_client()
    response = (
        supabase.table("fraud_alerts")
        .update(
            {
                "is_resolved": True,
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", alert_id)
        .execute()
    )

    return {"message": "Fraud alert resolved", "data": response.data}


def process_shift_timesheets(logs: Optional[list] = None):
    """Pair daily check-ins and check-outs to calculate shift durations, punctuality, and overtime."""
    from collections import defaultdict

    if not logs:
        logs = []

    daily_groups = defaultdict(list)
    for log in logs:
        emp_id = log.get("employee_id")
        dt_str = log.get("checked_at")
        if not emp_id or not dt_str:
            continue
        date_key = dt_str[:10]  # YYYY-MM-DD
        daily_groups[(emp_id, date_key)].append(log)

    timesheets = []
    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")

    total_hours_sum = 0.0
    total_overtime_sum = 0.0
    on_time_count = 0
    total_completed_or_in_progress = 0
    currently_on_site_count = 0

    for (emp_id, date_key), day_logs in daily_groups.items():
        # Sort logs chronologically
        day_logs.sort(key=lambda x: x.get("checked_at", ""))

        check_ins = [l for l in day_logs if l.get("check_type") == "check_in"]
        check_outs = [l for l in day_logs if l.get("check_type") == "check_out"]

        first_in = check_ins[0] if check_ins else None
        last_out = check_outs[-1] if check_outs else None

        sample_log = day_logs[0]
        emp = sample_log.get("employees") or {}
        site = sample_log.get("sites") or {}

        check_in_time = first_in.get("checked_at") if first_in else None
        check_out_time = last_out.get("checked_at") if last_out else None

        duration_hours = 0.0
        formatted_duration = "0h 0m"
        shift_status = "unknown"
        arrival_status = "on_time"
        minutes_late = 0
        overtime_hours = 0.0
        regular_hours = 0.0
        avg_trust_score = (
            sum(l.get("trust_score") or 0 for l in day_logs) / len(day_logs)
            if day_logs
            else 95.0
        )

        if first_in and last_out:
            try:
                t_in = datetime.fromisoformat(check_in_time.replace("Z", "+00:00"))
                t_out = datetime.fromisoformat(check_out_time.replace("Z", "+00:00"))
                duration_sec = max(0, (t_out - t_in).total_seconds())
                duration_hours = round(duration_sec / 3600.0, 2)
                h = int(duration_sec // 3600)
                m = int((duration_sec % 3600) // 60)
                formatted_duration = f"{h}h {m}m"
                shift_status = "completed"
            except Exception:
                shift_status = "completed"
        elif first_in and not last_out:
            if date_key == today_str:
                try:
                    t_in = datetime.fromisoformat(check_in_time.replace("Z", "+00:00"))
                    duration_sec = max(0, (now_utc - t_in).total_seconds())
                    duration_hours = round(duration_sec / 3600.0, 2)
                    h = int(duration_sec // 3600)
                    m = int((duration_sec % 3600) // 60)
                    formatted_duration = f"{h}h {m}m (active)"
                    shift_status = "in_progress"
                    currently_on_site_count += 1
                except Exception:
                    shift_status = "in_progress"
            else:
                shift_status = "missing_checkout"
        elif last_out and not first_in:
            shift_status = "missing_checkin"

        # Punctuality calculation (Standard target: 09:00, 15m grace period)
        if first_in and check_in_time:
            try:
                t_in = datetime.fromisoformat(check_in_time.replace("Z", "+00:00"))
                in_mins = t_in.hour * 60 + t_in.minute
                target_mins = 9 * 60
                grace_mins = 9 * 60 + 15
                if in_mins > grace_mins:
                    arrival_status = "late"
                    minutes_late = in_mins - target_mins
                else:
                    arrival_status = "on_time"
                    on_time_count += 1
            except Exception:
                arrival_status = "on_time"
                on_time_count += 1

        # Overtime calculation
        if duration_hours > 8.0:
            overtime_hours = round(duration_hours - 8.0, 2)
            regular_hours = 8.0
        else:
            overtime_hours = 0.0
            regular_hours = duration_hours

        if shift_status in ("completed", "in_progress"):
            total_hours_sum += duration_hours
            total_overtime_sum += overtime_hours
            total_completed_or_in_progress += 1

        timesheets.append({
            "id": f"{emp_id}_{date_key}",
            "employee_id": emp_id,
            "employee_name": f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip() or "Employee",
            "employee_code": emp.get("employee_code", ""),
            "email": emp.get("email", ""),
            "date": date_key,
            "site_name": site.get("name", "Marrakesh Hub"),
            "check_in_time": check_in_time,
            "check_out_time": check_out_time,
            "duration_hours": duration_hours,
            "regular_hours": regular_hours,
            "overtime_hours": overtime_hours,
            "formatted_duration": formatted_duration,
            "shift_status": shift_status,
            "arrival_status": arrival_status,
            "minutes_late": minutes_late,
            "trust_score": round(avg_trust_score, 1),
            "raw_logs_count": len(day_logs),
        })

    timesheets.sort(key=lambda x: (x["date"], x["check_in_time"] or ""), reverse=True)

    on_time_rate = (
        round((on_time_count / total_completed_or_in_progress * 100.0), 1)
        if total_completed_or_in_progress > 0
        else 100.0
    )
    avg_shift = (
        round(total_hours_sum / total_completed_or_in_progress, 2)
        if total_completed_or_in_progress > 0
        else 0.0
    )

    # Build Payroll Summary grouped by employee
    payroll_map = defaultdict(lambda: {
        "employee_id": "",
        "employee_name": "",
        "employee_code": "",
        "email": "",
        "total_regular_hours": 0.0,
        "total_overtime_hours": 0.0,
        "total_hours": 0.0,
        "completed_shifts": 0,
        "days_worked": set(),
        "on_time_shifts": 0,
    })

    for ts in timesheets:
        e_id = ts["employee_id"]
        entry = payroll_map[e_id]
        entry["employee_id"] = e_id
        entry["employee_name"] = ts["employee_name"]
        entry["employee_code"] = ts["employee_code"]
        entry["email"] = ts["email"]
        entry["total_regular_hours"] += ts["regular_hours"]
        entry["total_overtime_hours"] += ts["overtime_hours"]
        entry["total_hours"] += ts["duration_hours"]
        entry["days_worked"].add(ts["date"])
        if ts["shift_status"] == "completed":
            entry["completed_shifts"] += 1
        if ts["arrival_status"] == "on_time":
            entry["on_time_shifts"] += 1

    payroll_summary = []
    for p in payroll_map.values():
        days_count = len(p["days_worked"])
        punctuality = (
            round((p["on_time_shifts"] / days_count * 100.0), 1)
            if days_count > 0
            else 100.0
        )
        payroll_summary.append({
            "employee_id": p["employee_id"],
            "employee_name": p["employee_name"],
            "employee_code": p["employee_code"],
            "email": p["email"],
            "total_regular_hours": round(p["total_regular_hours"], 2),
            "total_overtime_hours": round(p["total_overtime_hours"], 2),
            "total_hours": round(p["total_hours"], 2),
            "days_worked": days_count,
            "completed_shifts": p["completed_shifts"],
            "punctuality_pct": punctuality,
        })

    metrics = {
        "total_hours_worked": round(total_hours_sum, 2),
        "total_overtime_hours": round(total_overtime_sum, 2),
        "avg_shift_hours": avg_shift,
        "on_time_rate_pct": on_time_rate,
        "currently_on_site": currently_on_site_count,
        "total_shifts_logged": len(timesheets),
    }

    return timesheets, metrics, payroll_summary


@router.get("/timesheets")
async def get_admin_timesheets(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve automated daily shift timesheets with duration, overtime, and punctuality metrics."""
    supabase = get_supabase_client()
    query = (
        supabase.table("attendance_logs")
        .select("*, employees(first_name, last_name, email, employee_code), sites(name)")
        .order("checked_at", desc=False)
    )

    if employee_id:
        query = query.eq("employee_id", employee_id)
    if date_from:
        query = query.gte("checked_at", date_from)
    if date_to:
        query = query.lte("checked_at", date_to)

    resp = query.limit(2000).execute()
    logs = resp.data or []

    timesheets, metrics, payroll_summary = process_shift_timesheets(logs)

    return {
        "timesheets": timesheets,
        "metrics": metrics,
        "payroll": payroll_summary,
    }


@router.get("/export-timesheet")
async def export_timesheet_csv(
    mode: Optional[str] = "detailed",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Generate and export timesheet report as CSV with calculated shift durations and overtime."""
    supabase = get_supabase_client()

    query = (
        supabase.table("attendance_logs")
        .select("*, employees(first_name, last_name, email, employee_code), sites(name)")
        .order("checked_at", desc=False)
    )

    if date_from:
        query = query.gte("checked_at", date_from)
    if date_to:
        query = query.lte("checked_at", date_to)

    resp = query.limit(2000).execute()
    logs = resp.data or []

    timesheets, metrics, payroll = process_shift_timesheets(logs)

    output = io.StringIO()
    writer = csv.writer(output)

    if mode == "payroll":
        writer.writerow([
            "Employee Code",
            "Employee Name",
            "Email",
            "Total Regular Hours",
            "Total Overtime Hours",
            "Total Worked Hours",
            "Days Worked",
            "Completed Shifts",
            "Punctuality Rate (%)"
        ])
        for row in payroll:
            writer.writerow([
                row["employee_code"],
                row["employee_name"],
                row["email"],
                row["total_regular_hours"],
                row["total_overtime_hours"],
                row["total_hours"],
                row["days_worked"],
                row["completed_shifts"],
                f"{row['punctuality_pct']}%",
            ])
        filename = f"facepass_payroll_summary_{datetime.now().strftime('%Y%m%d')}.csv"
    else:
        writer.writerow([
            "Date",
            "Employee Code",
            "Employee Name",
            "Email",
            "Site",
            "Check-In Time",
            "Check-Out Time",
            "Total Hours",
            "Regular Hours",
            "Overtime Hours",
            "Shift Duration",
            "Arrival Status",
            "Minutes Late",
            "Shift Status",
            "Avg Trust Score"
        ])
        for ts in timesheets:
            in_t = ts["check_in_time"][11:19] if ts["check_in_time"] and len(ts["check_in_time"]) >= 19 else ""
            out_t = ts["check_out_time"][11:19] if ts["check_out_time"] and len(ts["check_out_time"]) >= 19 else ""
            writer.writerow([
                ts["date"],
                ts["employee_code"],
                ts["employee_name"],
                ts["email"],
                ts["site_name"],
                in_t,
                out_t,
                ts["duration_hours"],
                ts["regular_hours"],
                ts["overtime_hours"],
                ts["formatted_duration"],
                ts["arrival_status"],
                ts["minutes_late"],
                ts["shift_status"],
                f"{ts['trust_score']}%",
            ])
        filename = f"facepass_shift_timesheets_{datetime.now().strftime('%Y%m%d')}.csv"

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        },
    )


@router.post("/sites")
async def create_site(
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Create a new work site with geofence perimeter."""
    supabase = get_supabase_client()
    employee = current_user.get("employee")
    admin = current_user.get("admin")
    company_id = (employee["company_id"] if employee else (admin["company_id"] if admin else None)) or "c0000000-0000-0000-0000-000000000001"

    site_data = {
        "company_id": company_id,
        "name": payload.get("name", "New Work Site"),
        "address": payload.get("address", ""),
        "latitude": float(payload["latitude"]),
        "longitude": float(payload["longitude"]),
        "radius_meters": int(payload.get("radius_meters", 150)),
        "is_active": True,
    }

    res = supabase.table("sites").insert(site_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Could not create work site")
    return res.data[0]


@router.patch("/sites/{site_id}")
async def update_site_geofence(
    site_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update a site's geofence radius, location, or name."""
    supabase = get_supabase_client()
    update_data = {}
    if "radius_meters" in payload:
        update_data["radius_meters"] = int(payload["radius_meters"])
    if "latitude" in payload:
        update_data["latitude"] = float(payload["latitude"])
    if "longitude" in payload:
        update_data["longitude"] = float(payload["longitude"])
    if "name" in payload:
        update_data["name"] = payload["name"].strip()
    if "address" in payload:
        update_data["address"] = payload["address"].strip()

    res = (
        supabase.table("sites")
        .update(update_data)
        .eq("id", site_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=400, detail="Could not update site geofence")
    return res.data[0]


@router.post("/digest/send")
async def send_attendance_digest(
    payload: dict,
):
    """Send automated or on-demand HR attendance digest email."""
    try:
        supabase = get_supabase_client()
        recipient_email = payload.get("recipient_email", "nelsonizah13@gmail.com").strip()
        report_type = payload.get("report_type", "daily")
        hr_name = payload.get("hr_name", "HR Administrator")

        # Fetch actual attendance logs
        logs_res = (
            supabase.table("attendance_logs")
            .select("*, employees(first_name, last_name, email, employee_code), sites(name)")
            .order("checked_at", desc=False)
            .limit(2000)
            .execute()
        )
        logs = logs_res.data or []
        timesheets, metrics, _ = process_shift_timesheets(logs)

        today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if report_type == "daily":
            active_shifts = [ts for ts in timesheets if ts["date"] == today_iso]
            if not active_shifts:
                active_shifts = timesheets[:5]
        else:
            active_shifts = timesheets[:15]

        emp_res = supabase.table("employees").select("id", count="exact").eq("is_active", True).execute()
        total_emp = emp_res.count or 1

        flagged_res = supabase.table("attendance_logs").select("id", count="exact").eq("status", "flagged").execute()
        flagged_count = flagged_res.count or 0

        present_workers = set(s["employee_id"] for s in active_shifts)

        email_shifts = []
        for s in active_shifts:
            email_shifts.append({
                "employee_name": s.get("employee_name", "Felix Izah"),
                "employee_code": s.get("employee_code", "FP-64164"),
                "check_in_time": s.get("check_in_time") or "—",
                "check_out_time": s.get("check_out_time") or "In Progress",
                "duration": s.get("formatted_duration") or "—",
                "is_on_time": s.get("arrival_status") == "on_time",
                "trust_score": s.get("trust_score", 95.0),
            })

        digest_data = {
            "date_str": datetime.now(timezone.utc).strftime("%A, %B %d, %Y"),
            "total_employees": total_emp,
            "present_count": len(present_workers) if present_workers else metrics.get("currently_on_site", 1),
            "punctuality_rate": f"{metrics.get('on_time_rate_pct', 100)}%",
            "total_hours": f"{metrics.get('total_hours_worked', 0)} hrs",
            "total_overtime": f"{metrics.get('total_overtime_hours', 0)} hrs",
            "flagged_count": flagged_count,
            "shifts": email_shifts,
        }

        success = send_hr_attendance_digest(
            to_email=recipient_email,
            hr_name=hr_name,
            report_type=report_type,
            digest_data=digest_data,
        )

        return {
            "success": success,
            "recipient_email": recipient_email,
            "report_type": report_type,
            "digest_data": digest_data,
            "message": f"Attendance digest successfully sent to {recipient_email}!"
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Digest generation error: {str(e)}")


@router.get("/digest/preview")
async def preview_attendance_digest(report_type: str = "daily"):
    """Preview HR attendance digest data and summary before sending."""
    try:
        supabase = get_supabase_client()
        logs_res = (
            supabase.table("attendance_logs")
            .select("*, employees(first_name, last_name, email, employee_code), sites(name)")
            .order("checked_at", desc=False)
            .limit(2000)
            .execute()
        )
        logs = logs_res.data or []
        timesheets, metrics, _ = process_shift_timesheets(logs)
        today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        if report_type == "daily":
            active_shifts = [ts for ts in timesheets if ts["date"] == today_iso] or timesheets[:5]
        else:
            active_shifts = timesheets[:15]

        emp_res = supabase.table("employees").select("id", count="exact").eq("is_active", True).execute()
        total_emp = emp_res.count or 1

        flagged_res = supabase.table("attendance_logs").select("id", count="exact").eq("status", "flagged").execute()
        flagged_count = flagged_res.count or 0

        present_workers = set(s["employee_id"] for s in active_shifts)

        email_shifts = []
        for s in active_shifts:
            email_shifts.append({
                "employee_name": s.get("employee_name", "Felix Izah"),
                "employee_code": s.get("employee_code", "FP-64164"),
                "check_in_time": s.get("check_in_time") or "—",
                "check_out_time": s.get("check_out_time") or "In Progress",
                "duration": s.get("formatted_duration") or "—",
                "is_on_time": s.get("arrival_status") == "on_time",
                "trust_score": s.get("trust_score", 95.0),
            })

        return {
            "date_str": datetime.now(timezone.utc).strftime("%A, %B %d, %Y"),
            "total_employees": total_emp,
            "present_count": len(present_workers) if present_workers else metrics.get("currently_on_site", 1),
            "punctuality_rate": f"{metrics.get('on_time_rate_pct', 100)}%",
            "total_hours": f"{metrics.get('total_hours_worked', 0)} hrs",
            "total_overtime": f"{metrics.get('total_overtime_hours', 0)} hrs",
            "flagged_count": flagged_count,
            "shifts": email_shifts,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Digest preview error: {str(e)}")


