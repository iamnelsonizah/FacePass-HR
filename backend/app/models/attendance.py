"""Pydantic models for Attendance entities."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Optional


class CheckInRequest(BaseModel):
    """Request body for check-in (non-file fields)."""
    latitude: float
    longitude: float
    device_fingerprint: Optional[str] = None
    client_uuid: Optional[UUID] = None  # For offline idempotency


class CheckOutRequest(BaseModel):
    """Request body for check-out (non-file fields)."""
    latitude: float
    longitude: float
    device_fingerprint: Optional[str] = None
    client_uuid: Optional[UUID] = None


class AttendanceResponse(BaseModel):
    """Attendance log returned to clients."""
    id: UUID
    employee_id: UUID
    site_id: Optional[UUID] = None
    check_type: str
    checked_at: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geofence_distance_meters: Optional[float] = None
    face_match_confidence: Optional[float] = None
    liveness_score: Optional[float] = None
    trust_score: Optional[float] = None
    status: str
    flag_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AttendanceListResponse(BaseModel):
    """Paginated attendance log list."""
    items: list[AttendanceResponse]
    total: int
    page: int
    limit: int
