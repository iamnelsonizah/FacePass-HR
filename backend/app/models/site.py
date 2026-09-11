"""Pydantic models for Site entities."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Optional


class SiteBase(BaseModel):
    """Base site fields."""
    name: str
    address: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: float = 100.0


class SiteCreate(SiteBase):
    """Fields required to create a site."""
    company_id: UUID


class SiteUpdate(BaseModel):
    """Fields that can be updated on a site."""
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_meters: Optional[float] = None
    is_active: Optional[bool] = None


class SiteResponse(SiteBase):
    """Site data returned to clients."""
    id: UUID
    company_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
