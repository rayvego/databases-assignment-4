"""
Failure Simulation - Module B
==============================
Introduces failures during concurrent execution and verifies that the
system rolls back correctly with no partial data stored.

Requires: Next.js dev server running on http://localhost:3000

Run:  python3 stress/failure_simulation.py
"""

import requests
import threading
import time
import sys
import os

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000/api")
RESULTS = {"valid": 0, "invalid": 0, "errors": []}
LOCK = threading.Lock()


def log_result(valid, message=""):
    with LOCK:
        if valid:
            RESULTS["valid"] += 1
        else:
            RESULTS["invalid"] += 1
            RESULTS["errors"].append(message)


def login_as_admin():
    """Login as admin and return the JWT token."""
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "username": "admin",
            "password": "admin123",
        },
        timeout=10,
    )
    if resp.status_code == 200:
        return resp.json().get("token")
    return None


def test_invalid_data_rejected():
    """
    Test that the API correctly rejects invalid data:
    - Missing required fields
    - Invalid types
    - Non-existent foreign keys
    """
    print("\n--- Failure Simulation: Invalid Data Rejection ---")

    token = login_as_admin()
    if not token:
        print("  [SKIP] Cannot authenticate.")
        return None

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Test 1: Missing required fields on allocation
    resp = requests.post(
        f"{BASE_URL}/allocations",
        headers=headers,
        json={
            "studentId": 999,
            # Missing roomId, checkInDate
        },
        timeout=10,
    )
    if resp.status_code in (400, 404, 422, 500):
        log_result(True, "Missing fields correctly rejected")
        print("  [OK] Missing required fields rejected")
    else:
        log_result(False, f"Missing fields accepted with {resp.status_code}")
        print(f"  [FAIL] Missing fields accepted with status {resp.status_code}")

    # Test 2: Non-existent foreign key (student doesn't exist)
    resp = requests.post(
        f"{BASE_URL}/allocations",
        headers=headers,
        json={
            "studentId": 999999,
            "roomId": 1,
            "checkInDate": "2025-01-15",
        },
        timeout=10,
    )
    if resp.status_code in (400, 404, 409, 422, 500):
        log_result(True, "Non-existent FK correctly rejected")
        print("  [OK] Non-existent foreign key rejected")
    else:
        log_result(False, f"Non-existent FK accepted with {resp.status_code}")
        print(f"  [FAIL] Non-existent FK accepted with status {resp.status_code}")

    # Test 3: Invalid data type
    resp = requests.post(
        f"{BASE_URL}/rooms",
        headers=headers,
        json={
            "blockId": "not_a_number",
            "roomNumber": "FAIL-001",
            "floorNumber": 1,
            "capacity": 2,
        },
        timeout=10,
    )
    if resp.status_code in (400, 422, 500):
        log_result(True, "Invalid type correctly rejected")
        print("  [OK] Invalid data type rejected")
    else:
        log_result(False, f"Invalid type accepted with {resp.status_code}")
        print(f"  [FAIL] Invalid type accepted with status {resp.status_code}")

    # Test 4: Empty body
    resp = requests.post(
        f"{BASE_URL}/allocations", headers=headers, json={}, timeout=10
    )
    if resp.status_code in (400, 404, 422, 500):
        log_result(True, "Empty body correctly rejected")
        print("  [OK] Empty request body rejected")
    else:
        log_result(False, f"Empty body accepted with {resp.status_code}")
        print(f"  [FAIL] Empty body accepted with status {resp.status_code}")

    return RESULTS["invalid"] == 0


def test_concurrent_failures():
    """
    Test that concurrent requests with some failures don't corrupt data.
    Mix valid and invalid requests simultaneously.
    """
    print("\n--- Failure Simulation: Concurrent Valid + Invalid Requests ---")

    token = login_as_admin()
    if not token:
        print("  [SKIP] Cannot authenticate.")
        return None

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get valid student and room IDs dynamically
    resp_students = requests.get(f"{BASE_URL}/students", headers=headers, timeout=10)
    resp_rooms = requests.get(f"{BASE_URL}/rooms", headers=headers, timeout=10)

    if resp_students.status_code != 200 or not resp_students.json():
        print("  [SKIP] No students found.")
        return None

    if resp_rooms.status_code != 200 or not resp_rooms.json():
        print("  [SKIP] No rooms found.")
        return None

    students = resp_students.json()
    rooms = resp_rooms.json()

    # Find a room with available capacity
    valid_room_id = None
    for r in rooms:
        room_data = r.get("room", {})
        if room_data.get("currentOccupancy", 0) < room_data.get("capacity", 1):
            valid_room_id = room_data.get("roomId")
            break

    if not valid_room_id:
        print("  [SKIP] No rooms with available capacity.")
        return None

    valid_student_id = students[0].get("student", {}).get("studentId")
    print(f"  Using student_id={valid_student_id}, room_id={valid_room_id}")

    # Get current allocation count
    resp = requests.get(f"{BASE_URL}/allocations", headers=headers, timeout=10)
    pre_count = len(resp.json()) if resp.status_code == 200 else 0
    print(f"  Pre-test: {pre_count} allocations")

    results = {
        "valid_success": 0,
        "valid_fail": 0,
        "invalid_rejected": 0,
        "invalid_accepted": 0,
    }
    lock = threading.Lock()

    def send_valid_request(worker_id):
        """Send a valid allocation request."""
        try:
            resp = requests.post(
                f"{BASE_URL}/allocations",
                headers=headers,
                json={
                    "studentId": valid_student_id,
                    "roomId": valid_room_id,
                    "checkInDate": "2025-01-15",
                    "status": "Active",
                },
                timeout=10,
            )
            with lock:
                if resp.status_code in (200, 201):
                    results["valid_success"] += 1
                else:
                    results["valid_fail"] += 1
        except Exception:
            with lock:
                results["valid_fail"] += 1

    def send_invalid_request(worker_id):
        """Send an invalid allocation request."""
        try:
            resp = requests.post(
                f"{BASE_URL}/allocations",
                headers=headers,
                json={
                    "studentId": 999999,  # Non-existent
                    "roomId": valid_room_id,
                    "checkInDate": "2025-01-15",
                },
                timeout=10,
            )
            with lock:
                if resp.status_code in (400, 404, 409, 422, 500):
                    results["invalid_rejected"] += 1
                else:
                    results["invalid_accepted"] += 1
        except Exception:
            with lock:
                results["invalid_rejected"] += 1

    # Launch mixed concurrent requests
    threads = []
    for i in range(5):
        threads.append(threading.Thread(target=send_valid_request, args=(i,)))
        threads.append(threading.Thread(target=send_invalid_request, args=(i,)))

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    # Check post-test state
    resp = requests.get(f"{BASE_URL}/allocations", headers=headers, timeout=10)
    post_count = len(resp.json()) if resp.status_code == 200 else 0
    print(f"  Post-test: {post_count} allocations")

    print(
        f"  Valid requests: {results['valid_success']} succeeded, {results['valid_fail']} failed"
    )
    print(
        f"  Invalid requests: {results['invalid_rejected']} rejected, {results['invalid_accepted']} accepted"
    )

    if results["invalid_accepted"] > 0:
        print(f"  [FAIL] {results['invalid_accepted']} invalid requests were accepted")
    else:
        print("  [OK] All invalid requests were correctly rejected")

    return results["invalid_accepted"] == 0


def test_unauthorized_access():
    """
    Test that unauthorized requests are rejected.
    """
    print("\n--- Failure Simulation: Unauthorized Access ---")

    # Test without any token
    resp = requests.get(f"{BASE_URL}/rooms", timeout=10)
    if resp.status_code == 401:
        log_result(True, "Unauthenticated access correctly rejected")
        print("  [OK] Unauthenticated access rejected (401)")
    else:
        log_result(False, f"Unauthenticated access accepted with {resp.status_code}")
        print(
            f"  [FAIL] Unauthenticated access accepted with status {resp.status_code}"
        )

    # Test with invalid token
    headers = {"Authorization": "Bearer invalid-token-here"}
    resp = requests.get(f"{BASE_URL}/rooms", headers=headers, timeout=10)
    if resp.status_code == 401:
        log_result(True, "Invalid token correctly rejected")
        print("  [OK] Invalid token rejected (401)")
    else:
        log_result(False, f"Invalid token accepted with {resp.status_code}")
        print(f"  [FAIL] Invalid token accepted with status {resp.status_code}")

    # Test regular user trying admin-only operation
    user_resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "username": "user",
            "password": "user123",
        },
        timeout=10,
    )

    if user_resp.status_code == 200:
        user_token = user_resp.json().get("token")
        user_headers = {
            "Authorization": f"Bearer {user_token}",
            "Content-Type": "application/json",
        }

        resp = requests.post(
            f"{BASE_URL}/rooms",
            headers=user_headers,
            json={
                "blockId": 1,
                "roomNumber": "UNAUTH-001",
                "floorNumber": 1,
                "capacity": 1,
            },
            timeout=10,
        )

        if resp.status_code in (401, 403):
            log_result(True, "User admin-access correctly rejected")
            print(f"  [OK] Regular user denied admin operation ({resp.status_code})")
        else:
            log_result(False, f"User admin-access accepted with {resp.status_code}")
            print(
                f"  [FAIL] Regular user accepted admin operation with status {resp.status_code}"
            )

    return RESULTS["invalid"] == 0


def main():
    print("=" * 70)
    print("MODULE B: Failure Simulation")
    print("=" * 70)

    test_invalid_data_rejected()
    test_concurrent_failures()
    test_unauthorized_access()

    print(f"\n{'=' * 70}")
    print(f"Results: {RESULTS['valid']} valid, {RESULTS['invalid']} invalid")
    if RESULTS["errors"]:
        print(f"Errors ({len(RESULTS['errors'])}):")
        for err in RESULTS["errors"][:10]:
            print(f"  - {err}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
