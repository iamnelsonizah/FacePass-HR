"""Face recognition service using InsightFace / ArcFace.

Handles embedding extraction and face matching for FacePass.
"""

import logging
import numpy as np
import cv2
from typing import Optional

logger = logging.getLogger(__name__)


class FaceRecognitionService:
    """Service for face detection, embedding extraction, and matching."""

    def __init__(self):
        """Initialize the face recognition model.

        Loads InsightFace's buffalo_l model for ArcFace embeddings.
        Falls back gracefully if the model is not available.
        """
        self.model = None
        self._initialized = False
        try:
            import insightface
            from insightface.app import FaceAnalysis

            self.model = FaceAnalysis(
                name="buffalo_l",
                providers=["CPUExecutionProvider"],
            )
            # ctx_id=-1 specifies CPU execution
            self.model.prepare(ctx_id=-1, det_size=(640, 640))
            self._initialized = True
            logger.info("InsightFace model loaded successfully")
        except Exception as e:
            logger.warning(
                f"Could not load InsightFace model: {e}. "
                "Face recognition will not be available until the model is installed. "
                "Run: insightface-cli model.download buffalo_l"
            )

    @property
    def is_available(self) -> bool:
        """Check if the face recognition model is loaded."""
        return self._initialized and self.model is not None

    @staticmethod
    def apply_clahe_preprocessing(img: np.ndarray) -> np.ndarray:
        """Apply Contrast Limited Adaptive Histogram Equalization (CLAHE) to normalize lighting.

        Enhances face detection in harsh outdoor sunlight or dim indoor lighting
        while preserving natural skin textures and ArcFace landmark fidelity.
        """
        try:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l_channel, a_channel, b_channel = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l_channel)
            limg = cv2.merge((cl, a_channel, b_channel))
            return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
        except Exception:
            return img

    def extract_embedding(self, image_bytes: bytes) -> Optional[np.ndarray]:
        """Extract a 512D face embedding from an image.

        Args:
            image_bytes: Raw image bytes (JPEG/PNG).

        Returns:
            512-dimensional numpy array, or None if no face detected.
        """
        if not self.is_available:
            logger.error("Face recognition model not available")
            return None

        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            logger.error("Could not decode image")
            return None

        # Detect faces and extract embeddings
        faces = self.model.get(img)

        # Outdoor / Shadow fallback: if no face detected, try CLAHE lighting normalization
        if not faces:
            enhanced_img = self.apply_clahe_preprocessing(img)
            faces = self.model.get(enhanced_img)
            if faces:
                logger.info("Face detected after CLAHE lighting normalization")

        if not faces:
            logger.warning("No face detected in image")
            return None

        if len(faces) > 1:
            logger.warning(f"Multiple faces detected ({len(faces)}), using largest")
            # Use the face with the largest bounding box area
            faces = sorted(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                reverse=True,
            )

        # Return the 512D embedding
        embedding = faces[0].embedding
        return embedding / np.linalg.norm(embedding)  # L2 normalize

    def compare_embeddings(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Compute cosine similarity between two embeddings.

        Args:
            emb1: First 512D embedding.
            emb2: Second 512D embedding.

        Returns:
            Cosine similarity score (0.0 to 1.0).
        """
        # Both embeddings should already be L2-normalized
        similarity = float(np.dot(emb1, emb2))
        return max(0.0, min(1.0, similarity))  # Clamp to [0, 1]

    def find_best_match(
        self,
        target_embedding: np.ndarray,
        candidate_embeddings: list[dict],
        threshold: float = 0.6,
    ) -> Optional[tuple[str, float]]:
        """Find the best matching face from a list of candidates.

        Args:
            target_embedding: The embedding to match against.
            candidate_embeddings: List of dicts with 'id', 'employee_id', 'embedding' keys.
            threshold: Minimum cosine similarity to consider a match.

        Returns:
            Tuple of (employee_id, confidence_score) or None if no match above threshold.
        """
        if not candidate_embeddings:
            return None

        best_match_id = None
        best_score = 0.0

        for candidate in candidate_embeddings:
            raw_emb = candidate["embedding"]
            if isinstance(raw_emb, str):
                import json
                try:
                    raw_emb = json.loads(raw_emb)
                except Exception:
                    raw_emb = [float(x.strip()) for x in raw_emb.strip("[]").split(",") if x.strip()]
            candidate_emb = np.array(raw_emb, dtype=np.float32)
            score = self.compare_embeddings(target_embedding, candidate_emb)

            if score > best_score:
                best_score = score
                best_match_id = candidate["employee_id"]

        if best_score >= threshold:
            return (best_match_id, best_score)

        return None


# Module-level singleton
face_service = FaceRecognitionService()
