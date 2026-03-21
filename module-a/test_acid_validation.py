"""
ACID Validation Experiments - Phase 5 & 6
==========================================
Comprehensive tests demonstrating all ACID properties:
- Atomicity: multi-table transactions either fully complete or fully rollback
- Consistency: constraints hold after every operation
- Isolation: concurrent transactions cannot see intermediate states
- Durability: committed data persists across restarts

Also includes the required multi-relation transaction demo (3 tables in one txn).

Run:  python3 test_acid_validation.py
"""

import sys
import os
import shutil
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "database"))

from db_manager import DatabaseManager
from transaction_manager import TransactionManager, TransactionError
from recovery_manager import RecoveryManager
from write_ahead_log import WriteAheadLog


# ---------------------------------------------------------------------------
# Test directory management
# ---------------------------------------------------------------------------

TEST_DIR = os.path.join(os.path.dirname(__file__), "test_acid_data")


def clean_test_dir():
    if os.path.exists(TEST_DIR):
        shutil.rmtree(TEST_DIR)
    os.makedirs(TEST_DIR, exist_ok=True)


def wal_dir():
    return os.path.join(TEST_DIR, "wal")


def data_dir():
    return os.path.join(TEST_DIR, "data")


# ---------------------------------------------------------------------------
# Helper: fresh database with 3 tables
# ---------------------------------------------------------------------------


def fresh_db():
    db = DatabaseManager()
    db.create_database("hostel_db")

    db.create_table(
        "hostel_db",
        "students",
        {
            "student_id": int,
            "enrollment_no": str,
            "course": str,
            "batch_year": int,
            "guardian_name": str,
            "guardian_contact": str,
        },
        order=8,
        search_key="student_id",
    )

    db.create_table(
        "hostel_db",
        "rooms",
        {
            "room_id": int,
            "block_id": int,
            "room_number": str,
            "floor_number": int,
            "capacity": int,
            "current_occupancy": int,
            "room_type": str,
            "status": str,
        },
        order=8,
        search_key="room_id",
    )

    db.create_table(
        "hostel_db",
        "allocations",
        {
            "allocation_id": int,
            "student_id": int,
            "room_id": int,
            "check_in_date": str,
            "check_out_date": str,
            "status": str,
        },
        order=8,
        search_key="allocation_id",
    )

    # Seed
    students, _ = db.get_table("hostel_db", "students")
    students.insert(
        {
            "student_id": 3,
            "enrollment_no": "CS2023001",
            "course": "B.Tech CSE",
            "batch_year": 2023,
            "guardian_name": "Raj Sharma",
            "guardian_contact": "8888888801",
        }
    )
    students.insert(
        {
            "student_id": 5,
            "enrollment_no": "ME2022001",
            "course": "B.Tech ME",
            "batch_year": 2022,
            "guardian_name": "Ajay Verma",
            "guardian_contact": "8888888803",
        }
    )

    rooms, _ = db.get_table("hostel_db", "rooms")
    rooms.insert(
        {
            "room_id": 1,
            "block_id": 1,
            "room_number": "101",
            "floor_number": 1,
            "capacity": 2,
            "current_occupancy": 1,
            "room_type": "Non-AC",
            "status": "Available",
        }
    )
    rooms.insert(
        {
            "room_id": 4,
            "block_id": 1,
            "room_number": "202",
            "floor_number": 2,
            "capacity": 2,
            "current_occupancy": 0,
            "room_type": "AC",
            "status": "Available",
        }
    )

    allocations, _ = db.get_table("hostel_db", "allocations")
    allocations.insert(
        {
            "allocation_id": 1,
            "student_id": 3,
            "room_id": 1,
            "check_in_date": "2023-08-01",
            "check_out_date": "",
            "status": "Active",
        }
    )

    return db


# ---------------------------------------------------------------------------
# Experiment 1: Multi-relation transaction (3 tables in one atomic unit)
# ---------------------------------------------------------------------------


def test_multi_relation_transaction():
    """
    Demonstrate one transaction spanning 3 relations:
    1. Insert a new student
    2. Update room occupancy
    3. Insert a new allocation
    All three are part of a single atomic transaction.
    """
    print("\n--- Experiment 1: Multi-Relation Transaction (3 tables) ---")
    clean_test_dir()
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=wal_dir())

    students, _ = db.get_table("hostel_db", "students")
    rooms, _ = db.get_table("hostel_db", "rooms")
    allocations, _ = db.get_table("hostel_db", "allocations")

    # Pre-transaction state
    pre_alloc_count = len(allocations.get_all())
    pre_room_occupancy = rooms.get(1)["current_occupancy"]
    print(
        f"  Before: {pre_alloc_count} allocations, room 1 occupancy={pre_room_occupancy}"
    )

    # BEGIN transaction across 3 tables
    tx = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    print(f"  BEGIN transaction {tx} on [students, rooms, allocations]")

    # Operation 1: Insert new student
    ok, result = tm.tx_insert(
        tx,
        "hostel_db",
        "students",
        {
            "student_id": 100,
            "enrollment_no": "CS2025100",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Multi-Relation Test",
            "guardian_contact": "1001001000",
        },
    )
    assert ok, f"Insert student failed: {result}"
    print(f"  1. Inserted student_id=100")

    # Operation 2: Update room occupancy
    ok, result = tm.tx_update(
        tx,
        "hostel_db",
        "rooms",
        1,
        {
            "room_id": 1,
            "block_id": 1,
            "room_number": "101",
            "floor_number": 1,
            "capacity": 2,
            "current_occupancy": 2,
            "room_type": "Non-AC",
            "status": "Full",
        },
    )
    assert ok, f"Update room failed: {result}"
    print(f"  2. Updated room_id=1 occupancy: {pre_room_occupancy} -> 2")

    # Operation 3: Insert new allocation
    ok, result = tm.tx_insert(
        tx,
        "hostel_db",
        "allocations",
        {
            "allocation_id": 100,
            "student_id": 100,
            "room_id": 1,
            "check_in_date": "2025-01-15",
            "check_out_date": "",
            "status": "Active",
        },
    )
    assert ok, f"Insert allocation failed: {result}"
    print(f"  3. Inserted allocation_id=100 (student 100 -> room 1)")

    # COMMIT
    ok, msg = tm.commit(tx)
    assert ok, f"Commit failed: {msg}"
    print(f"  COMMIT: {msg}")

    # Verify all 3 changes are visible
    assert students.get(100) is not None, "Student not found after commit"
    assert rooms.get(1)["current_occupancy"] == 2, "Room occupancy not updated"
    assert allocations.get(100) is not None, "Allocation not found after commit"
    assert len(allocations.get_all()) == pre_alloc_count + 1, "Allocation count wrong"
    print(
        f"  After: {len(allocations.get_all())} allocations, room 1 occupancy={rooms.get(1)['current_occupancy']}"
    )

    print("[PASS] Single transaction successfully modified all 3 relations atomically")


# ---------------------------------------------------------------------------
# Experiment 2: Atomicity - crash mid-transaction, verify full rollback
# ---------------------------------------------------------------------------


def test_atomicity():
    """
    Simulate a crash during a multi-table transaction.
    Verify that ALL partial changes are rolled back - no incomplete updates remain.
    """
    print("\n--- Experiment 2: Atomicity (crash mid-transaction) ---")
    clean_test_dir()
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=wal_dir())

    students, _ = db.get_table("hostel_db", "students")
    rooms, _ = db.get_table("hostel_db", "rooms")
    allocations, _ = db.get_table("hostel_db", "allocations")

    # Capture pre-transaction state
    pre_students = students.get_all()
    pre_rooms = rooms.get_all()
    pre_allocs = allocations.get_all()

    # Persist pre-transaction state (simulates checkpoint before crash)
    rm = RecoveryManager(db, wal_dir=wal_dir(), data_dir=data_dir())
    rm.persist_all_tables()

    # Start transaction
    tx = tm.begin("hostel_db", ["students", "rooms", "allocations"])

    # Make partial changes across 3 tables
    tm.tx_insert(
        tx,
        "hostel_db",
        "students",
        {
            "student_id": 200,
            "enrollment_no": "CRASH200",
            "course": "Crash",
            "batch_year": 2099,
            "guardian_name": "Crash",
            "guardian_contact": "2002002000",
        },
    )
    tm.tx_update(
        tx,
        "hostel_db",
        "rooms",
        1,
        {
            "room_id": 1,
            "block_id": 1,
            "room_number": "101",
            "floor_number": 1,
            "capacity": 2,
            "current_occupancy": 99,
            "room_type": "Non-AC",
            "status": "Full",
        },
    )
    tm.tx_insert(
        tx,
        "hostel_db",
        "allocations",
        {
            "allocation_id": 200,
            "student_id": 200,
            "room_id": 1,
            "check_in_date": "2099-01-01",
            "check_out_date": "",
            "status": "Active",
        },
    )
    print("  Made partial changes across 3 tables")

    # CRASH: rollback instead of commit (simulates failure)
    tm.rollback(tx)
    print("  Simulated crash: rolled back instead of committing")

    # Verify ALL tables are back to pre-transaction state
    post_students = students.get_all()
    post_rooms = rooms.get_all()
    post_allocs = allocations.get_all()

    assert post_students == pre_students, "Atomicity: students changed after rollback"
    assert post_rooms == pre_rooms, "Atomicity: rooms changed after rollback"
    assert post_allocs == pre_allocs, "Atomicity: allocations changed after rollback"
    assert students.get(200) is None, "Atomicity: uncommitted student survived"
    assert rooms.get(1)["current_occupancy"] == 1, (
        "Atomicity: uncommitted room change survived"
    )
    assert allocations.get(200) is None, "Atomicity: uncommitted allocation survived"

    print("  All 3 tables restored to pre-transaction state")
    print(
        "[PASS] Multi-table transaction fully rolled back - no partial updates remain"
    )


# ---------------------------------------------------------------------------
# Experiment 3: Consistency - constraints hold after operations
# ---------------------------------------------------------------------------


def test_consistency():
    """
    Verify that all relations remain valid after operations:
    - Valid references (student_id in allocation must exist in students)
    - Non-negative values (occupancy >= 0, capacity > 0)
    - Status constraints
    """
    print("\n--- Experiment 3: Consistency (constraints hold) ---")
    clean_test_dir()
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=wal_dir())

    students, _ = db.get_table("hostel_db", "students")
    rooms, _ = db.get_table("hostel_db", "rooms")
    allocations, _ = db.get_table("hostel_db", "allocations")

    # Valid transaction
    tx = tm.begin("hostel_db", ["students", "rooms", "allocations"])

    # Insert valid student
    tm.tx_insert(
        tx,
        "hostel_db",
        "students",
        {
            "student_id": 300,
            "enrollment_no": "CS2025300",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Consistency Test",
            "guardian_contact": "3003003000",
        },
    )

    # Update room with valid occupancy (non-negative, within capacity)
    tm.tx_update(
        tx,
        "hostel_db",
        "rooms",
        4,
        {
            "room_id": 4,
            "block_id": 1,
            "room_number": "202",
            "floor_number": 2,
            "capacity": 2,
            "current_occupancy": 1,
            "room_type": "AC",
            "status": "Available",
        },
    )

    # Insert valid allocation (references existing student and room)
    tm.tx_insert(
        tx,
        "hostel_db",
        "allocations",
        {
            "allocation_id": 300,
            "student_id": 300,
            "room_id": 4,
            "check_in_date": "2025-01-15",
            "check_out_date": "",
            "status": "Active",
        },
    )

    tm.commit(tx)

    # Verify consistency constraints
    # 1. All allocation student_ids reference existing students
    for _, alloc in allocations.get_all():
        student = students.get(alloc["student_id"])
        assert student is not None, (
            f"Consistency: allocation references non-existent student_id={alloc['student_id']}"
        )
    print("  [OK] All allocation student_ids reference existing students")

    # 2. All allocation room_ids reference existing rooms
    for _, alloc in allocations.get_all():
        room = rooms.get(alloc["room_id"])
        assert room is not None, (
            f"Consistency: allocation references non-existent room_id={alloc['room_id']}"
        )
    print("  [OK] All allocation room_ids reference existing rooms")

    # 3. Room occupancy is non-negative and within capacity
    for _, room in rooms.get_all():
        assert room["current_occupancy"] >= 0, (
            f"Consistency: room_id={room['room_id']} has negative occupancy"
        )
        assert room["current_occupancy"] <= room["capacity"], (
            f"Consistency: room_id={room['room_id']} over capacity"
        )
    print("  [OK] All room occupancies are non-negative and within capacity")

    # 4. Student IDs are positive
    for _, student in students.get_all():
        assert student["student_id"] > 0, (
            f"Consistency: invalid student_id={student['student_id']}"
        )
    print("  [OK] All student IDs are positive")

    print("[PASS] All consistency constraints verified after transaction")


# ---------------------------------------------------------------------------
# Experiment 4: Isolation - concurrent transactions, no interference
# ---------------------------------------------------------------------------


def test_isolation():
    """
    Run concurrent transactions on the same data.
    Verify that intermediate states are not visible and no data corruption occurs.
    Uses serialized execution (one transaction at a time).
    """
    print("\n--- Experiment 4: Isolation (concurrent transactions) ---")
    clean_test_dir()
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=wal_dir())

    results = {"success": 0, "blocked": 0, "errors": []}
    barrier = threading.Barrier(3)  # 3 threads start simultaneously

    def concurrent_worker(worker_id):
        try:
            barrier.wait(timeout=5)  # All threads reach this point together
            # Retry until lock acquired (serialized execution)
            while True:
                try:
                    tx = tm.begin("hostel_db", ["students", "rooms", "allocations"])
                    break
                except TransactionError:
                    time.sleep(0.01)  # Brief wait before retry

            # Each worker tries to insert a different student
            student_id = 500 + worker_id
            tm.tx_insert(
                tx,
                "hostel_db",
                "students",
                {
                    "student_id": student_id,
                    "enrollment_no": f"CS2025{student_id:03d}",
                    "course": "B.Tech CSE",
                    "batch_year": 2025,
                    "guardian_name": f"Isolation Worker {worker_id}",
                    "guardian_contact": f"{student_id}{student_id:03d}",
                },
            )
            tm.commit(tx)
            results["success"] += 1
        except Exception as e:
            results["errors"].append(f"Worker {worker_id}: {e}")

    # Launch 3 concurrent threads
    threads = []
    for i in range(3):
        t = threading.Thread(target=concurrent_worker, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join(timeout=10)

    print(
        f"  Results: {results['success']} succeeded, {results['blocked']} blocked, {len(results['errors'])} errors"
    )

    # Verify: all 3 workers should have succeeded (serialized, not corrupted)
    # The isolation lock ensures they run one at a time
    assert results["success"] == 3, f"Isolation: only {results['success']}/3 succeeded"
    assert len(results["errors"]) == 0, (
        f"Isolation: errors occurred: {results['errors']}"
    )

    # Verify data integrity - all 3 students exist
    students, _ = db.get_table("hostel_db", "students")
    for i in range(3):
        sid = 500 + i
        assert students.get(sid) is not None, f"Isolation: student_id={sid} missing"
    print("  All 3 concurrent transactions completed successfully (serialized)")
    print("  No data corruption: all 3 students present and correct")

    print("[PASS] Concurrent transactions serialized correctly, no interference")


# ---------------------------------------------------------------------------
# Experiment 5: Durability - restart system, verify committed data persists
# ---------------------------------------------------------------------------


def test_durability():
    """
    Restart the system and verify that committed data is still present.
    """
    print("\n--- Experiment 5: Durability (data persists after restart) ---")
    clean_test_dir()

    # Phase 1: Commit and persist
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=wal_dir())

    tx = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    tm.tx_insert(
        tx,
        "hostel_db",
        "students",
        {
            "student_id": 600,
            "enrollment_no": "CS2025600",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Durability Test",
            "guardian_contact": "6006006000",
        },
    )
    tm.commit(tx)

    # Persist to disk
    rm = RecoveryManager(db, wal_dir=wal_dir(), data_dir=data_dir())
    rm.persist_all_tables()
    print("  Committed student_id=600 and persisted to disk")

    # Phase 2: Simulate restart
    print("  Simulating system restart...")
    db2 = fresh_db()  # fresh empty tables
    rm2 = RecoveryManager(db2, wal_dir=wal_dir(), data_dir=data_dir())
    rm2.load_all_tables()

    students, _ = db2.get_table("hostel_db", "students")
    record = students.get(600)

    assert record is not None, "Durability: student_id=600 lost after restart"
    assert record["enrollment_no"] == "CS2025600", "Durability: data corrupted"
    assert record["guardian_name"] == "Durability Test", "Durability: data corrupted"
    print(f"  student_id=600 found after restart: {record['enrollment_no']}")

    # Original data also survived
    assert students.get(3) is not None, "Durability: original data lost"
    print("  Original data also preserved")

    print("[PASS] Committed data persists across system restart (durability verified)")


# ---------------------------------------------------------------------------
# Experiment 6: Crash + Recovery - full scenario
# ---------------------------------------------------------------------------


def test_crash_recovery():
    """
    Full crash recovery scenario:
    1. Commit a transaction, persist
    2. Start another transaction, crash mid-way
    3. Restart and recover
    4. Verify committed data present, uncommitted rolled back
    """
    print("\n--- Experiment 6: Crash Recovery (full scenario) ---")
    clean_test_dir()

    # Phase 1: Commit and persist
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=wal_dir())

    tx1 = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    tm.tx_insert(
        tx1,
        "hostel_db",
        "students",
        {
            "student_id": 700,
            "enrollment_no": "CS2025700",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Crash Recovery Test",
            "guardian_contact": "7007007000",
        },
    )
    tm.commit(tx1)

    rm = RecoveryManager(db, wal_dir=wal_dir(), data_dir=data_dir())
    rm.persist_all_tables()
    print("  Phase 1: Committed student_id=700, persisted to disk")

    # Phase 2: Crash mid-transaction
    tm2 = TransactionManager(db, wal_dir=wal_dir())
    tx2 = tm2.begin("hostel_db", ["students", "rooms", "allocations"])
    tm2.tx_insert(
        tx2,
        "hostel_db",
        "students",
        {
            "student_id": 999,
            "enrollment_no": "CRASH999",
            "course": "Crash",
            "batch_year": 2099,
            "guardian_name": "Crash",
            "guardian_contact": "9999999999",
        },
    )
    # CRASH - no commit, no persist
    print("  Phase 2: Started transaction, inserted student_id=999, CRASH")

    # Phase 3: Recovery
    print("  Phase 3: Restarting and recovering...")
    db3 = fresh_db()
    rm3 = RecoveryManager(db3, wal_dir=wal_dir(), data_dir=data_dir())
    report = rm3.recover()

    students, _ = db3.get_table("hostel_db", "students")

    assert students.get(700) is not None, "CrashRecovery: committed student_id=700 lost"
    assert students.get(999) is None, (
        "CrashRecovery: uncommitted student_id=999 survived"
    )
    assert students.get(3) is not None, "CrashRecovery: original data lost"

    print(f"  student_id=700 (committed): PRESENT")
    print(f"  student_id=999 (uncommitted): ROLLED BACK")
    print(f"  student_id=3 (original): PRESENT")
    print(
        f"  Recovery report: undone={report['transactions_undone']}, redone={report['transactions_redone']}"
    )

    print("[PASS] Crash recovery: committed data preserved, uncommitted rolled back")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print("=" * 70)
    print("ASSIGNMENT 3 - MODULE A: ACID Validation Experiments")
    print("=" * 70)

    test_multi_relation_transaction()
    test_atomicity()
    test_consistency()
    test_isolation()
    test_durability()
    test_crash_recovery()

    print("\n" + "=" * 70)
    print("All 6 ACID validation experiments passed.")
    print("=" * 70)


if __name__ == "__main__":
    main()
