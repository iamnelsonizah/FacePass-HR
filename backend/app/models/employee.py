"""Pydantic models for Employee entities."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr
from typing import Optional


class EmployeeBase(BaseModel):
    """Base employee fields."""
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    employee_code: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    """Fields required to create an employee."""
    company_id: UUID
    password: str  # For Supabase Auth signup


class EmployeeUpdate(BaseModel):
    """Fields that can be updated on an employee."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    employee_code: Optional[str] = None
    is_active: Optional[bool] = None


class EmployeeResponse(EmployeeBase):
    """Employee data returned to clients."""
    id: UUID
    company_id: UUID
    is_enrolled: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmployeeListResponse(BaseModel):
    """Paginated employee list."""
    items: list[EmployeeResponse]
    total: int
    page: int
    limit: int
