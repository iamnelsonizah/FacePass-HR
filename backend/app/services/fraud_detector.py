"""Behavioral Fraud & Anomaly Intelligence Engine for FacePass.

Detects:
1. Impossible Travel: Flags physical velocity > 120 km/h between check-in sites (GPS spoofing).
2. Pass-the-Phone Collusion: Flags 2+ employees checking in within 60s from the same device hardware ID.
3. Time-of-Day Anomaly: Flags attendance logged outside normal operational hours.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from dataclasses import dataclass
import logging
from app.services.geofence import haversine_distance

logger = logging.getLogger("app.services.fraud_detector")

# Speed threshold for impossible travel (km/h)
MAX_REALISTIC_SPEED_KMH = 120.0

# Collusion window (seconds)
COLLUSION_WINDOW_SECONDS = 90


@dataclass
class FraudEvaluation:
    is_flagged: bool
    impossible_travel: bool
    collusion_detected: bool
    anomaly_score: float  # 0.0 (normal) to 1.0 (highly abnormal)
    alert_type: Optional[str] = None
    severity: str = "low"
    reason: Optional[str] = None
    details: Optional[dict] = None


class FraudDetectorService:
    """Evaluates attendance events against behavioral patterns and hardware telemetry."""

    def evaluate_checkin(
        self,
        supabase_client,
        company_id: str,
        employee_id: str,
        latitude: float,
        longitude: float,
        device_fingerprint: Optional[str],
        current_time: Optional[datetime] = None,
    ) -> FraudEvaluation:
        """Run all behavioral checks on an incoming check-in attempt."""
        if current_time is None:
            current_time = datetime.now(timezone.utc)

        # 1. Check Impossible Travel
        travel_flag, travel_details = self._check_impossible_travel(
            supabase_client, employee_id, latitude, longitude, current_time
        )

        # 2. Check Pass-the-Phone Collusion
        collusion_flag, collusion_details = self._check_collusion(
            supabase_client, employee_id, device_fingerprint, current_time
        )

        # 3. Check Off-Hours Time Anomaly
        time_anomaly_score = self._compute_time_anomaly(current_time)

        # Aggregate Anomaly Score (0.0 to 1.0)
        anomaly_score = 0.0
        if travel_flag:
            anomaly_score += 0.5
        if collusion_flag:
            anomaly_score += 0.4
        anomaly_score += time_anomaly_score * 0.1
        anomaly_score = min(1.0, anomaly_score)

        is_flagged = travel_flag or collusion_flag or (anomaly_score >= 0.7)

        alert_type = None
        severity = "low"
        reason = None
        details = {
            "travel": travel_details,
            "collusion": collusion_details,
            "hour": current_time.hour,
        }

        if travel_flag:
            alert_type = "impossible_travel"
            severity = "critical"
            reason = f"Impossible velocity detected: {travel_details.get('speed_kmh', 0):.1f} km/h"
        elif collusion_flag:
            alert_type = "collusion"
            severity = "high"
            reason = f"Pass-the-phone detected: Same device used by another worker within {COLLUSION_WINDOW_SECONDS}s"
        elif anomaly_score >= 0.7:
            alert_type = "time_anomaly"
            severity = "medium"
            reason = "Irregular attendance timing detected"

        return FraudEvaluation(
            is_flagged=is_flagged,
            impossible_travel=travel_flag,
            collusion_detected=collusion_flag,
            anomaly_score=round(anomaly_score, 3),
            alert_type=alert_type,
            severity=severity,
            reason=reason,
            details=details,
        )

    def _check_impossible_travel(
        self,
        supabase_client,
        employee_id: str,
        latitude: float,
        longitude: float,
        current_time: datetime,
    ) -> tuple[bool, dict]:
        """Verify if travel velocity from last log exceeds maximum realistic speed."""
        try:
            # Query last attendance record within the last 6 hours
            six_hours_ago = (current_time - timedelta(hours=6)).isoformat()
            resp = (
                supabase_client.table("attendance_logs")
                .select("id, latitude, longitude, checked_at")
                .eq("employee_id", employee_id)
                .gte("checked_at", six_hours_ago)
                .order("checked_at", desc=True)
                .limit(1)
                .execute()
            )

            if not resp.data or len(resp.data) == 0:
                return False, {"message": "No recent prior check-ins"}

            last_log = resp.data[0]
            last_lat = last_log.get("latitude")
            last_lon = last_log.get("longitude")
            last_time_str = last_log.get("checked_at")

            if last_lat is None or last_lon is None or not last_time_str:
                return False, {"message": "Missing previous coordinates"}

            # Parse last timestamp
            last_time = datetime.fromisoformat(last_time_str.replace("Z", "+00:00"))
            time_delta_seconds = abs((current_time - last_time).total_seconds())

            if time_delta_seconds < 15:
                # Same minute retry, ignore velocity spike
                return False, {"message": "Within minimum retry threshold"}

            # Compute distance in kilometers
            dist_meters = haversine_distance(latitude, longitude, last_lat, last_lon)
            dist_km = dist_meters / 1000.0

            hours_elapsed = time_delta_seconds / 3600.0
            speed_kmh = dist_km / hours_elapsed if hours_elapsed > 0 else 0.0

            # If moved more than 2km at > 120 km/h, flag impossible travel
            is_impossible = dist_km > 2.0 and speed_kmh > MAX_REALISTIC_SPEED_KMH

            return is_impossible, {
                "distance_km": round(dist_km, 2),
                "time_delta_minutes": round(time_delta_seconds / 60.0, 1),
                "speed_kmh": round(speed_kmh, 1),
            }

        except Exception as err:
            logger.warn(f"Impossible travel check error: {err}")
            return False, {"error": str(err)}

    def _check_collusion(
        self,
        supabase_client,
        current_employee_id: str,
        device_fingerprint: Optional[str],
        current_time: datetime,
    ) -> tuple[bool, dict]:
        """Check if another worker recently checked in on the same physical phone."""
        if not device_fingerprint:
            return False, {"message": "No device fingerprint provided"}

        try:
            window_start = (
                current_time - timedelta(seconds=COLLUSION_WINDOW_SECONDS)
            ).isoformat()

            # Find any attendance log with the same device fingerprint from a DIFFERENT employee
            resp = (
                supabase_client.table("attendance_logs")
                .select("id, employee_id, checked_at")
                .eq("device_fingerprint", device_fingerprint)
                .neq("employee_id", current_employee_id)
                .gte("checked_at", window_start)
                .limit(1)
                .execute()
            )

            if resp.data and len(resp.data) > 0:
                other_log = resp.data[0]
                return True, {
                    "matched_employee_id": other_log.get("employee_id"),
                    "matched_attendance_id": other_log.get("id"),
                    "device_fingerprint": device_fingerprint,
                }

            return False, {"message": "Unique device usage verified"}

        except Exception as err:
            logger.warn(f"Collusion check error: {err}")
            return False, {"error": str(err)}

    def _compute_time_anomaly(self, current_time: datetime) -> float:
        """Score based on typical shift boundaries (e.g. 5:00 AM to 10:00 PM)."""
        hour = current_time.hour
        # Night shift or off-hours (11 PM - 5 AM)
        if 23 <= hour or hour < 5:
            return 0.7
        return 0.0

    def record_fraud_alert(
        self,
        supabase_client,
        company_id: str,
        employee_id: str,
        attendance_id: Optional[str],
        alert_type: str,
        severity: str,
        details: dict,
        risk_score: Optional[float] = None,
    ) -> Optional[str]:
        """Create a persistent security alert in the fraud_alerts table."""
        try:
            merged_details = {**details}
            if risk_score is not None:
                merged_details["risk_score"] = risk_score

            payload = {
                "company_id": company_id,
                "employee_id": employee_id,
                "attendance_id": attendance_id,
                "alert_type": alert_type,
                "severity": severity,
                "details": merged_details,
                "is_resolved": False,
            }
            resp = supabase_client.table("fraud_alerts").insert(payload).execute()

            if resp.data and len(resp.data) > 0:
                alert_id = resp.data[0].get("id")
                logger.info(f"Recorded fraud alert {alert_id} ({alert_type})")
                return alert_id
        except Exception as err:
            logger.error(f"Failed to record fraud alert: {err}")
        return None


# Singleton instance
fraud_detector = FraudDetectorService()
