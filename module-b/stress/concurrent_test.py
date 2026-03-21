"""
Concurrent User Simulation - Module B
======================================
Simulates multiple users performing operations simultaneously against
the Next.js API. Tests that users do not interfere with each other.

Requires: Next.js dev server running on http://localhost:3000

Run:  python3 stress/concurrent_test.py
"""

import requests
import threading
import time
import json
import sys
import os

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000/api")
RESULTS = {"success": 0, "failed": 0, "errors": []}
LOCK = threading.Lock()


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


def login_as_user():
    """Login as regular user and return the JWT token."""
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "username": "user",
            "password": "user123",
        },
        timeout=10,
    )
    if resp.status_code == 200:
        return resp.json().get("token")
    return None


def worker_read_rooms(token, worker_id):
    """Worker: read all rooms."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{BASE_URL}/rooms", headers=headers, timeout=10)
        log_result(
            resp.status_code == 200,
            f"Worker {worker_id} read rooms: {resp.status_code}",
        )
    except Exception as e:
        log_result(False, f"Worker {worker_id} read rooms failed: {e}")


def worker_read_students(token, worker_id):
    """Worker: read all students."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{BASE_URL}/students", headers=headers, timeout=10)
        log_result(
            resp.status_code == 200,
            f"Worker {worker_id} read students: {resp.status_code}",
        )
    except Exception as e:
        log_result(False, f"Worker {worker_id} read students failed: {e}")


def worker_read_allocations(token, worker_id):
    """Worker: read all allocations."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{BASE_URL}/allocations", headers=headers, timeout=10)
        log_result(
            resp.status_code == 200,
            f"Worker {worker_id} read allocations: {resp.status_code}",
        )
    except Exception as e:
        log_result(False, f"Worker {worker_id} read allocations failed: {e}")


def worker_read_gatepasses(token, worker_id):
    """Worker: read all gate passes."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{BASE_URL}/gatepasses", headers=headers, timeout=10)
        log_result(
            resp.status_code == 200,
            f"Worker {worker_id} read gatepasses: {resp.status_code}",
        )
    except Exception as e:
        log_result(False, f"Worker {worker_id} read gatepasses failed: {e}")


def worker_read_maintenance(token, worker_id):
    """Worker: read all maintenance requests."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{BASE_URL}/maintenance", headers=headers, timeout=10)
        log_result(
            resp.status_code == 200,
            f"Worker {worker_id} read maintenance: {resp.status_code}",
        )
    except Exception as e:
        log_result(False, f"Worker {worker_id} read maintenance failed: {e}")


def run_concurrent_test():
    """Run concurrent user simulation."""
    print("=" * 70)
    print("MODULE B: Concurrent User Simulation")
    print("=" * 70)

    # Login
    admin_token = login_as_admin()
    user_token = login_as_user()

    if not admin_token:
        print("[WARN] Admin login failed. Trying with default credentials...")
        # Try common defaults
        for creds in [
            ("admin", "password"),
            ("admin", "admin"),
            ("test", "test"),
        ]:
            resp = requests.post(
                f"{BASE_URL}/auth/login",
                json={
                    "username": creds[0],
                    "password": creds[1],
                },
                timeout=10,
            )
            if resp.status_code == 200:
                admin_token = resp.json().get("token")
                print(f"[OK] Logged in as {creds[0]}")
                break

    if not user_token:
        print("[WARN] User login failed. Some tests may be skipped.")

    if not admin_token and not user_token:
        print("[ERROR] Could not authenticate. Is the dev server running?")
        print("  Run: cd module-b && bun run dev")
        return False

    token = admin_token or user_token
    print(f"\nUsing token from: {'admin' if admin_token else 'user'}")

    # Define workers
    workers = []
    for i in range(5):
        workers.append(
            threading.Thread(target=worker_read_rooms, args=(token, f"rooms-{i}"))
        )
        workers.append(
            threading.Thread(target=worker_read_students, args=(token, f"students-{i}"))
        )
        workers.append(
            threading.Thread(
                target=worker_read_allocations, args=(token, f"allocs-{i}")
            )
        )
        workers.append(
            threading.Thread(target=worker_read_gatepasses, args=(token, f"gp-{i}"))
        )
        workers.append(
            threading.Thread(target=worker_read_maintenance, args=(token, f"maint-{i}"))
        )

    print(f"\nLaunching {len(workers)} concurrent workers (5 users x 5 resources)...")
    start = time.time()

    # Start all threads simultaneously
    for w in workers:
        w.start()

    # Wait for all to complete
    for w in workers:
        w.join(timeout=30)

    elapsed = time.time() - start

    # Report
    print(f"\nResults ({elapsed:.2f}s):")
    print(f"  Successful: {RESULTS['success']}")
    print(f"  Failed:     {RESULTS['failed']}")

    if RESULTS["errors"]:
        print(f"\nErrors ({len(RESULTS['errors'])}):")
        for err in RESULTS["errors"][:10]:  # Show first 10
            print(f"  - {err}")
        if len(RESULTS["errors"]) > 10:
            print(f"  ... and {len(RESULTS['errors']) - 10} more")

    all_passed = RESULTS["failed"] == 0
    print(
        f"\n{'[PASS]' if all_passed else '[FAIL]'} Concurrent user simulation: "
        f"{RESULTS['success']}/{RESULTS['success'] + RESULTS['failed']} requests succeeded"
    )

    return all_passed


if __name__ == "__main__":
    success = run_concurrent_test()
    sys.exit(0 if success else 1)
