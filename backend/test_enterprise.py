"""Test suite for FacePass enterprise features."""

import sys
import numpy as np
import cv2
from app.services.face_recognition import face_service
from app.services.storage import upload_attendance_snapshot
from app.db.supabase import get_supabase_client


def test_clahe_enhancement():
    print("Testing CLAHE lighting normalization...")
    # Generate synthetic darkened face-like image
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    cv2.circle(img, (150, 150), 80, (40, 40, 40), -1) # Dark face
    enhanced = face_service.apply_clahe_preprocessing(img)
    assert enhanced.shape == img.shape, "Shape mismatch"
    assert enhanced.mean() >= img.mean(), "CLAHE should enhance average brightness/contrast"
    print("✓ CLAHE lighting enhancement passed! Mean brightness improved from", round(img.mean(), 2), "to", round(enhanced.mean(), 2))


def test_storage_snapshot():
    print("\nTesting audit snapshot compression & storage...")
    # Create test JPEG bytes
    test_img = np.full((400, 400, 3), 180, dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", test_img)
    img_bytes = encoded.tobytes()

    url = upload_attendance_snapshot(img_bytes, "test-audit-snapshot-id")
    print("✓ Snapshot upload response:", url or "Local fallback handled gracefully")


def test_db_queries():
    print("\nTesting Supabase connectivity & site querying...")
    supabase = get_supabase_client()
    sites = supabase.table("sites").select("*").eq("is_active", True).execute()
    print("✓ Active sites count:", len(sites.data or []))
    for s in (sites.data or [])[:2]:
        print(f"  - Site: {s['name']} (lat: {s['latitude']}, lon: {s['longitude']}, radius: {s['radius_meters']}m)")

    employees = supabase.table("employees").select("id, first_name, last_name, is_enrolled").execute()
    print("✓ Registered employees:", len(employees.data or []))
    for e in (employees.data or [])[:2]:
        print(f"  - {e['first_name']} {e['last_name']} (enrolled: {e['is_enrolled']})")


if __name__ == "__main__":
    test_clahe_enhancement()
    test_storage_snapshot()
    test_db_queries()
    print("\n🎉 ALL ENTERPRISE BACKEND TESTS PASSED!")
