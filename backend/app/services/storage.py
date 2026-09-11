"""Storage service for persisting attendance audit snapshots in Supabase Storage."""

import cv2
import numpy as np
import logging
from typing import Optional
from app.db.supabase import get_supabase_client
from app.config import get_settings

logger = logging.getLogger(__name__)

BUCKET_NAME = "attendance-snapshots"
_bucket_initialized = False


def _ensure_bucket_exists():
    """Ensure the attendance-snapshots bucket exists in Supabase Storage."""
    global _bucket_initialized
    if _bucket_initialized:
        return

    try:
        supabase = get_supabase_client()
        buckets = supabase.storage.list_buckets()
        bucket_names = [b.name for b in buckets] if hasattr(buckets, "__iter__") else []
        if BUCKET_NAME not in bucket_names:
            supabase.storage.create_bucket(BUCKET_NAME, options={"public": True})
            logger.info("Created Supabase storage bucket: %s", BUCKET_NAME)
        _bucket_initialized = True
    except Exception as e:
        logger.debug("Bucket verification: %s", e)
        _bucket_initialized = True  # Avoid continuous retries if permissions prevent list_buckets


def upload_attendance_snapshot(image_bytes: bytes, log_id: str) -> Optional[str]:
    """Compress and upload attendance verification photo to Supabase Storage.

    Args:
        image_bytes: Raw captured frame bytes.
        log_id: UUID of attendance record.

    Returns:
        Public URL of the stored snapshot, or None if upload fails.
    """
    if not image_bytes:
        return None

    try:
        _ensure_bucket_exists()

        # 1. Decode and optimize image for lightweight audit storage (max 640px)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return None

        h, w = img.shape[:2]
        max_dim = 640
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        # 2. Compress as JPEG (quality 75, typically ~35KB)
        success, encoded_img = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if not success:
            return None

        compressed_bytes = encoded_img.tobytes()
        file_path = f"snapshots/{log_id}.jpg"

        supabase = get_supabase_client()
        supabase.storage.from_(BUCKET_NAME).upload(
            file_path,
            compressed_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )

        # 3. Retrieve public URL
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path)
        logger.info("Uploaded audit snapshot for log %s -> %s", log_id, public_url)
        return public_url

    except Exception as e:
        logger.warning("Could not upload audit snapshot for %s: %s", log_id, e)
        return None
