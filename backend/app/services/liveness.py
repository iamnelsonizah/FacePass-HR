"""Liveness detection service for FacePass.

MVP implementation: challenge-response based liveness detection.
The client is asked to perform a random action (blink, head turn, smile)
and the server validates the response.
"""

import uuid
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# In-memory challenge store (use Redis in production)
_active_challenges: dict[str, dict] = {}

# Challenge expires after 60 seconds
CHALLENGE_EXPIRY_SECONDS = 60

CHALLENGE_TYPES = ["blink", "head_turn_left", "head_turn_right", "smile"]


def generate_challenge() -> dict:
    """Generate a random liveness challenge for the client.

    Returns:
        Dict with challenge_id, challenge_type, and expires_at.
    """
    import random

    challenge_id = str(uuid.uuid4())
    challenge_type = random.choice(CHALLENGE_TYPES)
    expires_at = time.time() + CHALLENGE_EXPIRY_SECONDS

    challenge = {
        "challenge_id": challenge_id,
        "challenge_type": challenge_type,
        "expires_at": expires_at,
        "created_at": time.time(),
    }

    _active_challenges[challenge_id] = challenge

    # Clean up expired challenges
    _cleanup_expired()

    return {
        "challenge_id": challenge_id,
        "challenge_type": challenge_type,
        "instruction": _get_instruction(challenge_type),
        "expires_in_seconds": CHALLENGE_EXPIRY_SECONDS,
    }


def verify_challenge(
    challenge_id: str,
    response_data: Optional[dict] = None,
) -> tuple[bool, float]:
    """Verify a liveness challenge response.

    For MVP, this is a simplified verification that checks:
    1. The challenge exists and hasn't expired
    2. The response was submitted within the time window

    In v2, this will include actual frame analysis for blink/head-turn detection.

    Args:
        challenge_id: The challenge ID to verify.
        response_data: Optional response data from the client.

    Returns:
        Tuple of (is_valid, liveness_score).
    """
    challenge = _active_challenges.pop(challenge_id, None)

    if challenge is None:
        logger.warning(f"Challenge {challenge_id} not found or already used")
        return (False, 0.0)

    if time.time() > challenge["expires_at"]:
        logger.warning(f"Challenge {challenge_id} has expired")
        return (False, 0.0)

    # MVP: If the challenge was responded to within the time window,
    # we give a base liveness score. In v2, we'll analyze the actual
    # face frames for blink/head-turn/smile detection.
    elapsed = time.time() - challenge["created_at"]

    # Score based on response time (faster = more likely real)
    if elapsed < 3:
        score = 0.95  # Very fast response
    elif elapsed < 10:
        score = 0.85  # Normal response time
    elif elapsed < 30:
        score = 0.70  # Slow but acceptable
    else:
        score = 0.50  # Very slow, suspicious

    return (True, score)


def _get_instruction(challenge_type: str) -> str:
    """Get human-readable instruction for a challenge type."""
    instructions = {
        "blink": "Please blink your eyes twice",
        "head_turn_left": "Please slowly turn your head to the left",
        "head_turn_right": "Please slowly turn your head to the right",
        "smile": "Please smile naturally",
    }
    return instructions.get(challenge_type, "Please look at the camera")


def _cleanup_expired():
    """Remove expired challenges from memory."""
    now = time.time()
    expired = [
        cid
        for cid, challenge in _active_challenges.items()
        if now > challenge["expires_at"]
    ]
    for cid in expired:
        del _active_challenges[cid]
