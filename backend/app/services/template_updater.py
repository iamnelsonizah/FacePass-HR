"""Adaptive Face Memory & Drift Adaptation for FacePass.

Maintains multi-template ensembles and updates face representations over time:
- Automatically enriches the employee's template ensemble when high-confidence,
  verified check-ins occur in diverse lighting.
- Prunes oldest drift templates to maintain a healthy cluster of 3–5 active embeddings.
- Prevents seasonal recognition degradation caused by facial hair, glasses, or natural aging.
"""

import numpy as np
import logging
from typing import Optional

logger = logging.getLogger("app.services.template_updater")

MAX_TEMPLATES_PER_EMPLOYEE = 5
DRIFT_CONFIDENCE_THRESHOLD = 0.88
DRIFT_SPOOF_THRESHOLD = 0.85


class TemplateDriftService:
    """Manages continuous biometric template adaptation."""

    def consider_drift_update(
        self,
        supabase_client,
        employee_id: str,
        new_embedding: np.ndarray,
        match_confidence: float,
        spoof_score: float,
        geofence_valid: bool,
    ) -> bool:
        """Evaluate if an attendance check-in photo should enrich the biometric template.

        Only high-quality, verified attendance events (verified face, verified live human,
        verified site geofence) qualify for template updates.
        """
        # Strict qualification criteria
        if (
            match_confidence < DRIFT_CONFIDENCE_THRESHOLD
            or spoof_score < DRIFT_SPOOF_THRESHOLD
            or not geofence_valid
        ):
            return False

        try:
            # Query existing templates
            resp = (
                supabase_client.table("embeddings")
                .select("id, is_primary, is_drift_template, created_at")
                .eq("employee_id", employee_id)
                .order("created_at", desc=False)
                .execute()
            )

            existing = resp.data or []

            # If at or above max capacity, prune the oldest drift template (never prune primary)
            if len(existing) >= MAX_TEMPLATES_PER_EMPLOYEE:
                drift_templates = [e for e in existing if e.get("is_drift_template")]
                if drift_templates:
                    oldest_id = drift_templates[0]["id"]
                    supabase_client.table("embeddings").delete().eq("id", oldest_id).execute()
                    logger.info(f"Pruned oldest drift template {oldest_id} for employee {employee_id}")

            # Store the new drift embedding
            embedding_list = [float(x) for x in new_embedding.tolist()]
            supabase_client.table("embeddings").insert(
                {
                    "employee_id": employee_id,
                    "embedding": embedding_list,
                    "is_primary": False,
                    "is_drift_template": True,
                    "quality_score": round(match_confidence, 3),
                }
            ).execute()

            logger.info(f"Added new adaptive drift template for employee {employee_id} (conf: {match_confidence})")
            return True

        except Exception as err:
            logger.warn(f"Failed to record drift template: {err}")
            return False


# Singleton instance
template_drift_service = TemplateDriftService()
