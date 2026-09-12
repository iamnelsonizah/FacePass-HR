"""Authentication router for FacePass.

Handles employee signup, login, dual ID/email authentication, profile updates, and avatar uploads.
"""

import logging
import random
import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.db.supabase import get_supabase_client, get_admin_client
from app.config import get_settings
from app.services.otp import create_otp, verify_otp
from app.services.email import send_activation_code_email, send_welcome_employee_id_email, send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
security = HTTPBearer()


# ---------- Request / Response Models ----------

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    company_id: Optional[str] = None
    phone: Optional[str] = None
    employee_code: Optional[str] = None


class LoginRequest(BaseModel):
    email_or_id: str  # Can be email (e.g. nelson@facepass.com) OR employee_code (e.g. FP-49201)
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    employee_code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    refresh_token: Optional[str] = None


class UserProfile(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    company_id: str
    employee_code: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_enrolled: bool
    is_active: bool


class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None


class SignUpResponse(BaseModel):
    pending_activation: bool = True
    email: str
    message: str
    dev_code: Optional[str] = None


class VerifyActivationRequest(BaseModel):
    email: EmailStr
    code: str


class VerifyActivationResponse(BaseModel):
    activated: bool
    employee_code: Optional[str] = None
    email: str
    message: str


class ResendActivationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email_or_id: str


class VerifyResetCodeRequest(BaseModel):
    email: str
    code: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


# ---------- Dependencies ----------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate JWT token and return the current user."""
    token = credentials.credentials
    supabase = get_supabase_client()

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        user = user_response.user

        employee = (
            supabase.table("employees")
            .select("*")
            .eq("auth_user_id", user.id)
            .single()
            .execute()
        )

        return {
            "auth_user_id": user.id,
            "email": user.email,
            "employee": employee.data if employee.data else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Token validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
        )


# ---------- Routes ----------

@router.post("/signup", response_model=SignUpResponse)
async def signup(request: SignUpRequest):
    """Register a new employee account with auto-generated Employee ID."""
    supabase = get_supabase_client()

    try:
        # 1. Resolve company_id if not provided
        company_id = request.company_id
        if not company_id:
            companies = supabase.table("companies").select("id").limit(1).execute()
            if companies.data and len(companies.data) > 0:
                company_id = companies.data[0]["id"]
            else:
                # Create default company
                new_comp = supabase.table("companies").insert({"name": "FacePass Enterprise"}).execute()
                company_id = new_comp.data[0]["id"]

        # 2. Generate unique Employee ID (e.g. FP-49201) if not explicitly provided
        employee_code = request.employee_code
        if not employee_code or not employee_code.strip():
            # Generate random 5-digit ID and check uniqueness
            for _ in range(5):
                candidate_code = f"FP-{random.randint(10000, 99999)}"
                existing = (
                    supabase.table("employees")
                    .select("id")
                    .eq("employee_code", candidate_code)
                    .execute()
                )
                if not existing.data:
                    employee_code = candidate_code
                    break
            if not employee_code:
                employee_code = f"FP-{random.randint(10000, 99999)}"
        else:
            employee_code = employee_code.strip().upper()

        # 3. Create pre-confirmed auth user in Supabase via Admin API
        admin_client = get_admin_client()
        try:
            admin_user = admin_client.auth.admin.create_user({
                "email": request.email,
                "password": request.password,
                "email_confirm": True,
            })
            auth_user_id = admin_user.user.id
        except Exception as admin_err:
            logger.warning("Admin user creation fallback: %s", admin_err)
            auth_response = supabase.auth.sign_up({
                "email": request.email,
                "password": request.password,
            })
            if not auth_response.user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to create user account",
                )
            auth_user_id = auth_response.user.id
            try:
                admin_client.auth.admin.update_user_by_id(auth_user_id, {"email_confirm": True})
            except Exception as conf_err:
                logger.warning("Auto-confirm note: %s", conf_err)
        auth_user_id = auth_user_id

        # 4. Create employee record (inactive pending OTP activation)
        employee_data = {
            "auth_user_id": auth_user_id,
            "company_id": company_id,
            "first_name": request.first_name.strip(),
            "last_name": request.last_name.strip(),
            "email": request.email.strip().lower(),
            "phone": request.phone,
            "employee_code": employee_code,
            "is_enrolled": False,
            "is_active": False,
        }

        supabase.table("employees").insert(employee_data).execute()

        # Generate 6-digit activation OTP and send email
        code = create_otp(
            request.email,
            "activation",
            {"auth_user_id": str(auth_user_id), "employee_code": employee_code},
        )
        send_activation_code_email(
            request.email,
            f"{request.first_name} {request.last_name}",
            code,
        )

        return SignUpResponse(
            pending_activation=True,
            email=request.email,
            message="A 6-digit activation code has been sent to your email.",
            dev_code=code,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Signup failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {str(e)}",
        )


@router.post("/verify-activation", response_model=VerifyActivationResponse)
async def verify_activation(request: VerifyActivationRequest):
    """Verify the 6-digit activation code and activate the employee account."""
    is_valid, error_msg, metadata = verify_otp(request.email, request.code, "activation")

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    clean_email = request.email.strip().lower()
    supabase = get_supabase_client()

    # Activate the employee record
    supabase.table("employees").update({"is_active": True}).eq("email", clean_email).execute()

    # Retrieve employee code and name
    emp_query = (
        supabase.table("employees")
        .select("employee_code, first_name, last_name")
        .eq("email", clean_email)
        .limit(1)
        .execute()
    )

    employee_code = (metadata or {}).get("employee_code")
    employee_name = ""
    if emp_query.data and len(emp_query.data) > 0:
        employee_code = emp_query.data[0].get("employee_code") or employee_code
        first = emp_query.data[0].get("first_name", "")
        last = emp_query.data[0].get("last_name", "")
        employee_name = f"{first} {last}".strip()

    # Send welcome email with official Employee ID
    if employee_code:
        send_welcome_employee_id_email(
            clean_email,
            employee_name or "Team Member",
            employee_code,
        )

    return VerifyActivationResponse(
        activated=True,
        employee_code=employee_code,
        email=request.email,
        message="Your account has been activated! Check your email for your Employee ID.",
    )


@router.post("/resend-activation")
async def resend_activation(request: ResendActivationRequest):
    """Resend a new 6-digit activation code to the user's email."""
    supabase = get_supabase_client()
    clean_email = request.email.strip().lower()

    emp = (
        supabase.table("employees")
        .select("first_name, last_name, is_active")
        .eq("email", clean_email)
        .limit(1)
        .execute()
    )

    if not emp.data or len(emp.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email address.",
        )

    if emp.data[0].get("is_active"):
        return {"message": "This account is already activated. Please sign in."}

    name = f"{emp.data[0].get('first_name', '')} {emp.data[0].get('last_name', '')}".strip()
    code = create_otp(clean_email, "activation")
    send_activation_code_email(clean_email, name or "User", code)

    return {"message": "A new activation code has been sent to your email.", "dev_code": code}


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send a 6-digit password reset code to the user's email."""
    supabase = get_supabase_client()
    raw_identifier = request.email_or_id.strip()

    if "@" in raw_identifier:
        clean_email = raw_identifier.lower()
        emp = (
            supabase.table("employees")
            .select("first_name, last_name, email")
            .eq("email", clean_email)
            .limit(1)
            .execute()
        )
    else:
        emp = (
            supabase.table("employees")
            .select("first_name, last_name, email")
            .ilike("employee_code", raw_identifier)
            .limit(1)
            .execute()
        )

    if not emp.data or len(emp.data) == 0:
        # Return success message anyway to prevent user enumeration
        return {"message": "If an account exists with that identifier, a reset code has been sent."}

    email = emp.data[0]["email"]
    name = f"{emp.data[0].get('first_name', '')} {emp.data[0].get('last_name', '')}".strip()

    code = create_otp(email, "password_reset")
    send_password_reset_email(email, name or "User", code)

    return {
        "message": "If an account exists with that identifier, a reset code has been sent.",
        "email": email,
        "dev_code": code,
    }


@router.post("/verify-reset-code")
async def verify_reset_code(request: VerifyResetCodeRequest):
    """Verify the password reset OTP code (without consuming it)."""
    from app.services.otp import _get_connection
    from datetime import datetime

    clean_email = request.email.strip().lower()
    clean_code = request.code.strip()

    with _get_connection() as conn:
        cursor = conn.execute(
            "SELECT id, code, expires_at, is_used FROM otp_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
            (clean_email, "password_reset"),
        )
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="No reset code found. Please request a new one.")
    if row["is_used"] == 1:
        raise HTTPException(status_code=400, detail="This reset code has already been used.")
    if datetime.utcnow() > datetime.fromisoformat(row["expires_at"]):
        raise HTTPException(status_code=400, detail="This reset code has expired. Please request a new one.")
    if row["code"] != clean_code:
        raise HTTPException(status_code=400, detail="Invalid reset code. Please check and try again.")

    return {"valid": True, "message": "Code verified. You may now set a new password."}


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset the user's password after OTP verification."""
    is_valid, error_msg, _ = verify_otp(request.email, request.code, "password_reset")

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    supabase = get_supabase_client()
    clean_email = request.email.strip().lower()

    # Find the auth_user_id for this employee
    emp = (
        supabase.table("employees")
        .select("auth_user_id")
        .eq("email", clean_email)
        .limit(1)
        .execute()
    )

    if not emp.data or len(emp.data) == 0:
        raise HTTPException(status_code=404, detail="Account not found.")

    auth_user_id = emp.data[0]["auth_user_id"]

    # Update the password via Supabase Admin API
    try:
        admin_client = get_admin_client()
        admin_client.auth.admin.update_user_by_id(
            auth_user_id,
            {"password": request.new_password},
        )
    except Exception as e:
        logger.error("Password reset failed for %s: %s", clean_email, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password. Please try again.",
        )

    return {"message": "Your password has been reset successfully. You can now sign in with your new password."}


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """Authenticate an employee using EITHER Employee ID (e.g. FP-49201) OR Email."""
    supabase = get_supabase_client()
    raw_identifier = request.email_or_id.strip()

    try:
        resolved_email = raw_identifier
        resolved_employee_code = None

        if "@" not in raw_identifier:
            # Identifier is an Employee ID! Look up corresponding email from employees table
            emp_query = (
                supabase.table("employees")
                .select("email, employee_code, first_name, last_name")
                .ilike("employee_code", raw_identifier)
                .limit(1)
                .execute()
            )

            if not emp_query.data or len(emp_query.data) == 0:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"No account found with Employee ID '{raw_identifier}'. Please check your ID.",
                )

            resolved_email = emp_query.data[0]["email"]
            resolved_employee_code = emp_query.data[0].get("employee_code")

        # Authenticate with Supabase Auth
        admin_client = get_admin_client()
        auth_response = admin_client.auth.sign_in_with_password({
            "email": resolved_email,
            "password": request.password,
        })

        if not auth_response.user or not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials. Please check your password.",
            )

        # Retrieve employee record and verify account activation
        emp_record = (
            supabase.table("employees")
            .select("employee_code, first_name, last_name, is_active")
            .eq("auth_user_id", auth_response.user.id)
            .limit(1)
            .execute()
        )
        first_name = None
        last_name = None
        if emp_record.data and len(emp_record.data) > 0:
            emp = emp_record.data[0]
            if not emp.get("is_active", True):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your account is not activated yet. Please verify your email with the 6-digit activation code.",
                )
            resolved_employee_code = emp.get("employee_code") or resolved_employee_code
            first_name = emp.get("first_name")
            last_name = emp.get("last_name")

        return AuthResponse(
            access_token=auth_response.session.access_token,
            refresh_token=auth_response.session.refresh_token,
            user_id=auth_response.user.id,
            email=auth_response.user.email or resolved_email,
            employee_code=resolved_employee_code,
            first_name=first_name,
            last_name=last_name,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Login failed for identifier %s: %s", raw_identifier, e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {str(e)}",
        )


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    employee = current_user.get("employee")
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile not found",
        )

    return UserProfile(
        id=employee["id"],
        email=employee["email"],
        first_name=employee["first_name"],
        last_name=employee["last_name"],
        company_id=employee["company_id"],
        employee_code=employee.get("employee_code"),
        phone=employee.get("phone"),
        avatar_url=employee.get("avatar_url"),
        is_enrolled=employee["is_enrolled"],
        is_active=employee["is_active"],
    )


@router.put("/me", response_model=UserProfile)
async def update_me(
    request: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update current employee profile details."""
    employee = current_user.get("employee")
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile not found",
        )

    update_payload = {}
    if request.first_name is not None and request.first_name.strip():
        update_payload["first_name"] = request.first_name.strip()
    if request.last_name is not None and request.last_name.strip():
        update_payload["last_name"] = request.last_name.strip()
    if request.phone is not None:
        update_payload["phone"] = request.phone.strip()
    if request.avatar_url is not None:
        update_payload["avatar_url"] = request.avatar_url.strip()

    if update_payload:
        supabase = get_supabase_client()
        res = (
            supabase.table("employees")
            .update(update_payload)
            .eq("id", employee["id"])
            .execute()
        )
        if res.data and len(res.data) > 0:
            employee = res.data[0]

    return UserProfile(
        id=employee["id"],
        email=employee["email"],
        first_name=employee["first_name"],
        last_name=employee["last_name"],
        company_id=employee["company_id"],
        employee_code=employee.get("employee_code"),
        phone=employee.get("phone"),
        avatar_url=employee.get("avatar_url"),
        is_enrolled=employee["is_enrolled"],
        is_active=employee["is_active"],
    )


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload and optimize an avatar image, store in Supabase Storage, and update profile."""
    employee = current_user.get("employee")
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty avatar file")

    supabase = get_supabase_client()

    try:
        # Resize avatar to standard 400x400 max
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            h, w = img.shape[:2]
            max_dim = 400
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            _, encoded = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            image_bytes = encoded.tobytes()

        file_path = f"avatars/{employee['id']}.jpg"
        supabase.storage.from_("avatars").upload(
            file_path,
            image_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        avatar_url = supabase.storage.from_("avatars").get_public_url(file_path)

        # Update employee record
        supabase.table("employees").update({"avatar_url": avatar_url}).eq("id", employee["id"]).execute()

        return {"avatar_url": avatar_url}
    except Exception as e:
        logger.error("Avatar upload failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload avatar: {str(e)}",
        )
