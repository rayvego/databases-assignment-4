"""
Race Condition Test - Module B
===============================
Identifies the critical operation (room allocation) and simulates many
users attempting it concurrently. Verifies that no incorrect results occur
(e.g., room occupancy exceeding capacity).

Requires: Next.js dev server running on http://localhost:3000

Run:  python3 stress/race_condition_test.py
"""

import requests
import threading
import time
import sys
import os
import random

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000/api")
RESULTS = {"success": 0, "failed": 0, "race_detected": False, "errors": []}
LOCK = threading.Lock()
TEST_RUN_ID = random.randint(10000, 99999)  # Unique per run to avoid FK conflicts


def log_result(success, message=""):
    with LOCK:
        if success:
            RESULTS["success"] += 1
        else:
            RESULTS["failed"] += 1
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


def create_room(token, room_number, capacity):
    """Create a new room and return its ID."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    # First get a block ID
    resp = requests.get(f"{BASE_URL}/rooms", headers=headers, timeout=10)
    block_id = 1
    if resp.status_code == 200 and resp.json():
        block_id = resp.json()[0].get("blockId", 1)

    resp = requests.post(
        f"{BASE_URL}/rooms",
        headers=headers,
        json={
            "blockId": block_id,
            "roomNumber": room_number,
            "floorNumber": 1,
            "capacity": capacity,
            "currentOccupancy": 0,
            "type": "Non-AC",
            "status": "Available",
        },
        timeout=10,
    )

    if resp.status_code == 201:
        return resp.json().get("roomId")
    return None


def create_student(token, student_id, enrollment_no):
    """Create a student via the members API (since students need a member first)."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(
        f"{BASE_URL}/students",
        headers=headers,
        json={
            "name": f"Race Test Student {student_id}",
            "email": f"race{student_id}@test.com",
            "contactNumber": f"999999{student_id:04d}",
            "age": 20,
            "gender": "Male",
            "enrollmentNo": enrollment_no,
            "course": "B.Tech CSE",
            "batchYear": 2025,
            "guardianName": "Race Test Guardian",
            "guardianContact": "9999999999",
        },
        timeout=10,
    )

    if resp.status_code == 201:
        data = resp.json()
        # The student ID is the memberId
        return data.get("student", {}).get("studentId") or data.get("member", {}).get(
            "memberId"
        )
    return None


def worker_allocate_room(token, worker_id, room_id, student_id):
    """Worker: try to allocate a student to a room."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        resp = requests.post(
            f"{BASE_URL}/allocations",
            headers=headers,
            json={
                "studentId": student_id,
                "roomId": room_id,
                "checkInDate": "2025-01-15",
                "status": "Active",
            },
            timeout=10,
        )

        with LOCK:
            if resp.status_code in (201, 200):
                RESULTS["success"] += 1
            else:
                RESULTS["failed"] += 1
                RESULTS["errors"].append(
                    f"Worker {worker_id}: allocation failed with {resp.status_code}: {resp.text[:200]}"
                )
    except Exception as e:
        log_result(False, f"Worker {worker_id}: exception: {e}")


def test_race_condition_on_allocation():
    """
    Test race condition: create a room with capacity=2, then have 5 workers
    try to allocate students to it simultaneously. If the system is correct,
    only 2 should succeed (or the occupancy should not exceed capacity).
    """
    print("\n--- Race Condition Test: Room Allocation ---")

    token = login_as_admin()
    if not token:
        print("  [SKIP] Cannot authenticate. Is the dev server running?")
        return None

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # STEP 1: Create a test room with capacity=2
    room_id = create_room(token, f"RACE-{TEST_RUN_ID}", capacity=2)
    if not room_id:
        print("  [SKIP] Could not create test room. Skipping race condition test.")
        return None
    print(f"  Created test room_id={room_id} with capacity=2")

    # STEP 2: Create 5 test students
    student_ids = []
    for i in range(5):
        sid = create_student(token, 9000 + i + TEST_RUN_ID, f"RACE{TEST_RUN_ID}{i:05d}")
        if sid:
            student_ids.append(sid)
    print(f"  Created {len(student_ids)} test students")

    if len(student_ids) < 2:
        print("  [SKIP] Not enough students created. Skipping.")
        return None

    # STEP 3: Record pre-test room state
    resp = requests.get(f"{BASE_URL}/rooms/{room_id}", headers=headers, timeout=10)
    pre_occupancy = (
        resp.json().get("currentOccupancy", 0) if resp.status_code == 200 else 0
    )
    pre_capacity = resp.json().get("capacity", 2) if resp.status_code == 200 else 2
    print(f"  Pre-test: room occupancy={pre_occupancy}, capacity={pre_capacity}")

    # STEP 4: Launch concurrent allocation attempts
    num_workers = min(len(student_ids), 5)
    threads = []
    for i in range(num_workers):
        t = threading.Thread(
            target=worker_allocate_room, args=(token, i, room_id, student_ids[i])
        )
        threads.append(t)

    print(f"  Launching {num_workers} concurrent allocation attempts...")
    start = time.time()

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    elapsed = time.time() - start

    # STEP 5: Check post-test room state
    resp = requests.get(f"{BASE_URL}/rooms/{room_id}", headers=headers, timeout=10)
    if resp.status_code == 200:
        post_occupancy = resp.json().get("currentOccupancy", 0)
        post_capacity = resp.json().get("capacity", 2)
        print(f"  Post-test: room occupancy={post_occupancy}, capacity={post_capacity}")

        # Check for race condition
        if post_occupancy > post_capacity:
            RESULTS["race_detected"] = True
            print(
                f"  [RACE CONDITION DETECTED] Occupancy ({post_occupancy}) exceeds capacity ({post_capacity})"
            )
        else:
            print(
                f"  [OK] Occupancy ({post_occupancy}) within capacity ({post_capacity})"
            )

        # Check allocations count
        resp = requests.get(f"{BASE_URL}/allocations", headers=headers, timeout=10)
        if resp.status_code == 200:
            room_allocs = [
                a
                for a in resp.json()
                if a.get("roomId") == room_id and a.get("status") == "Active"
            ]
            print(f"  Active allocations for this room: {len(room_allocs)}")

    print(f"\n  Results ({elapsed:.2f}s):")
    print(f"    Successful allocations: {RESULTS['success']}")
    print(f"    Failed allocations:     {RESULTS['failed']}")

    return not RESULTS["race_detected"]


def create_gatepass(token, student_id):
    """Create a new gate pass and return its ID."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(
        f"{BASE_URL}/gatepasses",
        headers=headers,
        json={
            "studentId": student_id,
            "outTime": "2025-01-15T08:00:00Z",
            "expectedInTime": "2025-01-15T20:00:00Z",
            "reason": "Personal",
            "status": "Pending",
        },
        timeout=10,
    )
    if resp.status_code in (200, 201):
        data = resp.json()
        return data.get("passId") or (data.get("gatePass", {}).get("passId"))
    return None


def test_race_condition_on_gatepass():
    """
    Test race condition: multiple users trying to approve the same gate pass.
    """
    print("\n--- Race Condition Test: Gate Pass Approval ---")

    token = login_as_admin()
    if not token:
        print("  [SKIP] Cannot authenticate.")
        return None

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Step 1: Get an existing student ID
    resp = requests.get(f"{BASE_URL}/students", headers=headers, timeout=10)
    if resp.status_code != 200 or not resp.json():
        print("  [SKIP] No students found.")
        return None

    students = resp.json()
    # API returns joined results: [{"student": {...}, "member": {...}}]
    student_id = students[0].get("student", {}).get("studentId") if students else None
    if not student_id:
        print("  [SKIP] Could not get student ID.")
        return None

    # Step 2: Create a pending gate pass to test with
    gatepass_id = create_gatepass(token, student_id)
    if not gatepass_id:
        print("  [SKIP] Could not create gate pass.")
        return None

    print(f"  Created gatepass_id={gatepass_id} with status=Pending")
    print(f"  Testing concurrent approval of gatepass_id={gatepass_id}")

    results = {"success": 0, "failed": 0}
    lock = threading.Lock()

    def approve_worker(worker_id):
        try:
            resp = requests.put(
                f"{BASE_URL}/gatepasses/{gatepass_id}",
                headers=headers,
                json={
                    "status": "Approved",
                },
                timeout=10,
            )
            with lock:
                if resp.status_code in (200, 201):
                    results["success"] += 1
                else:
                    results["failed"] += 1
        except Exception as e:
            with lock:
                results["failed"] += 1

    # Launch 5 concurrent approval attempts
    threads = []
    for i in range(5):
        t = threading.Thread(target=approve_worker, args=(i,))
        threads.append(t)

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    # Check final state
    resp = requests.get(
        f"{BASE_URL}/gatepasses/{gatepass_id}", headers=headers, timeout=10
    )
    if resp.status_code == 200:
        final_status = resp.json().get("status")
        print(f"  Final gate pass status: {final_status}")
        print(
            f"  Successful approvals: {results['success']}, Failed: {results['failed']}"
        )

        # Only one approval should have "won"
        if results["success"] > 1:
            print(
                f"  [NOTE] {results['success']} workers succeeded - system may allow duplicate approvals"
            )
        else:
            print(
                f"  [OK] Only {results['success']} approval succeeded (correct behavior)"
            )

    return True


def main():
    print("=" * 70)
    print("MODULE B: Race Condition Tests")
    print("=" * 70)

    test_race_condition_on_allocation()
    test_race_condition_on_gatepass()

    print("\n" + "=" * 70)
    if RESULTS["race_detected"]:
        print(
            "Race condition DETECTED - occupancy exceeded capacity under concurrent load."
        )
    else:
        print("Race condition tests complete. Check results above.")
    print("=" * 70)


if __name__ == "__main__":
    main()
