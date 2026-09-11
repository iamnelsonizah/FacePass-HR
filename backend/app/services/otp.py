"""OTP & Verification Code Service for FacePass.

Handles generation, storage, and verification of 6-digit activation codes
and password reset codes with SQLite persistence and expiration logic.
"""

import sqlite3
import random
import os
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("facepass.otp")

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "otp_store.sqlite",
)


def _get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_otp_db():
    """Create OTP table if it does not exist."""
    with _get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS otp_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                code TEXT NOT NULL,
                purpose TEXT NOT NULL, -- 'activation' or 'password_reset'
                metadata TEXT,
                created_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                is_used INTEGER DEFAULT 0
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_codes(email, purpose, is_used)")
        conn.commit()


# Initialize on import
init_otp_db()


def create_otp(email: str, purpose: str, metadata: dict = None, expiry_minutes: int = 15) -> str:
    """Generate a unique 6-digit OTP, invalidate prior codes for the same email/purpose, and store it."""
    clean_email = email.strip().lower()
    code = f"{random.randint(100000, 999999)}"
    now = datetime.utcnow()
    expires = now + timedelta(minutes=expiry_minutes)

    with _get_connection() as conn:
        # Invalidate existing unused codes for this email and purpose
        conn.execute(
            "UPDATE otp_codes SET is_used = 1 WHERE email = ? AND purpose = ? AND is_used = 0",
            (clean_email, purpose),
        )
        conn.execute(
            """
            INSERT INTO otp_codes (email, code, purpose, metadata, created_at, expires_at, is_used)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            """,
            (
                clean_email,
                code,
                purpose,
                json.dumps(metadata or {}),
                now.isoformat(),
                expires.isoformat(),
            ),
        )
        conn.commit()

    logger.info("Generated %s OTP for %s: %s (expires in %s mins)", purpose, clean_email, code, expiry_minutes)
    return code


def verify_otp(email: str, code: str, purpose: str) -> tuple[bool, str, dict]:
    """Verify an OTP code. Returns (is_valid, error_msg, metadata)."""
    clean_email = email.strip().lower()
    clean_code = code.strip()

    with _get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT id, code, metadata, expires_at, is_used
            FROM otp_codes
            WHERE email = ? AND purpose = ?
            ORDER BY id DESC LIMIT 1
            """,
            (clean_email, purpose),
        )
        row = cursor.fetchone()

        if not row:
            return False, "No verification code found. Please request a new one.", {}

        if row["is_used"] == 1:
            return False, "This verification code has already been used.", {}

        expires_at = datetime.fromisoformat(row["expires_at"])
        if datetime.utcnow() > expires_at:
            return False, "This verification code has expired. Please request a new code.", {}

        if row["code"] != clean_code:
            return False, "Invalid verification code. Please check and try again.", {}

        # Mark as used
        conn.execute("UPDATE otp_codes SET is_used = 1 WHERE id = ?", (row["id"],))
        conn.commit()

        meta = json.loads(row["metadata"]) if row["metadata"] else {}
        return True, "", meta


def get_latest_otp(email: str, purpose: str) -> str | None:
    """Retrieve the latest unused OTP code for dev/test verification."""
    clean_email = email.strip().lower()
    with _get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT code, expires_at, is_used
            FROM otp_codes
            WHERE email = ? AND purpose = ? AND is_used = 0
            ORDER BY id DESC LIMIT 1
            """,
            (clean_email, purpose),
        )
        row = cursor.fetchone()
        if row and datetime.utcnow() <= datetime.fromisoformat(row["expires_at"]):
            return row["code"]
    return None
