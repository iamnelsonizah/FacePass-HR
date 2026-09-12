"""Employee management router for FacePass.

Handles employee CRUD operations and face enrollment.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from typing import Optional

from app.db.supabase import get_supabase_client
from app.routers.auth import get_current_user
from app.services.face_recognition import face_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/employees", tags=["Employees"])


@router.get("/")
async def list_employees(
    page: int = 1,
    limit: int = 20,
    company_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List all employees with pagination.

    Query params:
        page: Page number (default: 1)
        limit: Items per page (default: 20)
        company_id: Filter by company ID
    """
    supabase = get_supabase_client()
    offset = (page - 1) * limit

    query = supabase.table("employees").select("*", count="exact")

    if company_id:
        query = query.eq("company_id", company_id)

    response = query.range(offset, offset + limit - 1).order("created_at", desc=True).execute()

    return {
        "items": response.data or [],
        "total": response.count or 0,
        "page": page,
        "limit": limit,
    }


@router.get("/{employee_id}")
async def get_employee(
    employee_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Get a single employee by ID."""
    supabase = get_supabase_client()

    response = (
        supabase.table("employees")
        .select("*")
        .eq("id", str(employee_id))
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    return response.data


@router.post("/enroll")
async def enroll_employee(
    employee_id: str = Form(...),
    images: list[UploadFile] = File(..., description="3-5 face images at different angles"),
    current_user: dict = Depends(get_current_user),
):
    """Enroll an employee by capturing face embeddings.

    Accepts 3-5 face images, extracts ArcFace embeddings from each,
    and stores them in the database for future face matching.
    """
    if not face_service.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition service is not available. Model may not be installed.",
        )

    if len(images) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 1 face image is required (3-5 recommended)",
        )

    if len(images) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 5 face images allowed",
        )

    supabase = get_supabase_client()

    # Verify employee exists
    employee = (
        supabase.table("employees")
        .select("id, is_enrolled, auth_user_id, company_id, email")
        .eq("id", employee_id)
        .single()
        .execute()
    )

    if not employee.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    # Extract embeddings from each image
    angles = ["front", "left", "right", "up", "down"]
    embeddings_stored = 0
    primary_image_bytes = None

    for i, image in enumerate(images):
        image_bytes = await image.read()
        embedding = face_service.extract_embedding(image_bytes)

        if embedding is None:
            logger.warning(f"No face detected in image {i + 1} for employee {employee_id}")
            continue

        if primary_image_bytes is None:
            primary_image_bytes = image_bytes

        # Store embedding in Supabase
        embedding_data = {
            "employee_id": employee_id,
            "embedding": embedding.tolist(),
            "capture_angle": angles[i] if i < len(angles) else f"angle_{i}",
            "is_active": True,
        }

        supabase.table("embeddings").insert(embedding_data).execute()
        embeddings_stored += 1

    if embeddings_stored == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No faces detected in any of the provided images. Please try again with clearer photos.",
        )

    # Upload primary enrollment portrait to Supabase Storage
    avatar_url = None
    if primary_image_bytes:
        try:
            storage_path = f"enrollment/{employee_id}.jpg"
            supabase.storage.from_("attendance-snapshots").upload(
                path=storage_path,
                file=primary_image_bytes,
                file_options={"content-type": "image/jpeg", "upsert": "true"},
            )
            avatar_url = supabase.storage.from_("attendance-snapshots").get_public_url(storage_path)
        except Exception as upload_err:
            logger.warning(f"Could not upload enrollment avatar: {upload_err}")

    # Mark employee as enrolled and store master avatar URL
    update_data = {"is_enrolled": True}
    if avatar_url:
        update_data["avatar_url"] = avatar_url
    supabase.table("employees").update(update_data).eq("id", employee_id).execute()

    # Automatically ensure user is registered in admin_users so the administrator can track all enrollments
    emp_data = employee.data or {}
    auth_user_id = emp_data.get("auth_user_id") or current_user.get("id")
    company_id = emp_data.get("company_id")
    email = emp_data.get("email") or current_user.get("email")

    if auth_user_id and company_id and email:
        try:
            existing_admin = (
                supabase.table("admin_users")
                .select("id")
                .eq("auth_user_id", auth_user_id)
                .limit(1)
                .execute()
            )
            if not existing_admin.data:
                supabase.table("admin_users").insert({
                    "auth_user_id": auth_user_id,
                    "company_id": company_id,
                    "email": email,
                    "role": "admin",
                    "is_active": True,
                }).execute()
                logger.info(f"Auto-registered {email} into admin_users for enrollment tracking")
        except Exception as admin_err:
            logger.warning(f"Could not auto-insert admin record: {admin_err}")

    return {
        "message": f"Successfully enrolled with {embeddings_stored} face embeddings",
        "employee_id": employee_id,
        "embeddings_stored": embeddings_stored,
        "total_images": len(images),
    }


@router.put("/{employee_id}")
async def update_employee(
    employee_id: UUID,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    phone: Optional[str] = None,
    employee_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
):
    """Update an employee's details."""
    supabase = get_supabase_client()

    update_data = {}
    if first_name is not None:
        update_data["first_name"] = first_name
    if last_name is not None:
        update_data["last_name"] = last_name
    if phone is not None:
        update_data["phone"] = phone
    if employee_code is not None:
        update_data["employee_code"] = employee_code
    if is_active is not None:
        update_data["is_active"] = is_active

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    response = (
        supabase.table("employees")
        .update(update_data)
        .eq("id", str(employee_id))
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    return response.data[0]
