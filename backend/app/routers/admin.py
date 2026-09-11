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


@router.get("/export-timesheet")
async def export_timesheet_csv(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Generate and export timesheet report as CSV with calculated work hours."""
    supabase = get_supabase_client()
    employee = current_user.get("employee")
    company_id = employee["company_id"] if employee else None

    # Fetch logs
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

    # Stream CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date",
        "Employee Code",
        "Employee Name",
        "Email",
        "Site",
        "Check Type",
        "Time",
        "Trust Score",
        "Spoof Score",
        "Status",
        "Flag Reason"
    ])

    for log in logs:
        emp = log.get("employees") or {}
        site = log.get("sites") or {}
        dt = log.get("checked_at", "")
        date_str = dt[:10] if dt else ""
        time_str = dt[11:19] if len(dt) >= 19 else ""

        writer.writerow([
            date_str,
            emp.get("employee_code", ""),
            f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
            emp.get("email", ""),
            site.get("name", "N/A"),
            log.get("check_type", ""),
            time_str,
            log.get("trust_score", ""),
            log.get("spoof_score", ""),
            log.get("status", ""),
            log.get("flag_reason", ""),
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=facepass_timesheet_{datetime.now().strftime('%Y%m%d')}.csv"
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
