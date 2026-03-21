"""
Crash Recovery Tests - Phase 4
===============================
Verifies:
1. Committed data persists after restart (durability)
2. Incomplete transactions are rolled back after crash (atomicity)
3. B+ Tree consistency is maintained after recovery

Run:  python3 test_recovery.py
"""

import sys
import os
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "database"))

from db_manager import DatabaseManager
from transaction_manager import TransactionManager, TransactionError
from recovery_manager import RecoveryManager
from bplus_persistence import save_tree_to_disk, load_tree_from_disk
from bplustree import BPlusTree, BPlusTreeNode


# ---------------------------------------------------------------------------
# Helper: create a fresh database with 3 tables
# ---------------------------------------------------------------------------


def fresh_db():
    """Return a fresh DatabaseManager with 3 seeded tables."""
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

    # Seed initial data
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


TEST_DIR = os.path.join(os.path.dirname(__file__), "test_recovery_data")


def clean_test_dir():
    """Remove and recreate the test data directory."""
    if os.path.exists(TEST_DIR):
        shutil.rmtree(TEST_DIR)
    os.makedirs(TEST_DIR, exist_ok=True)


def get_wal_dir():
    return os.path.join(TEST_DIR, "wal")


def get_data_dir():
    return os.path.join(TEST_DIR, "data")


# ---------------------------------------------------------------------------
# Test 1: Durability - committed data persists after restart
# ---------------------------------------------------------------------------


def test_durability():
    print("\n--- Test 1: DURABILITY (committed data persists after restart) ---")
    clean_test_dir()

    # STEP 1: Create database, commit a transaction, persist to disk
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=get_wal_dir())

    tx = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    tm.tx_insert(
        tx,
        "hostel_db",
        "students",
        {
            "student_id": 10,
            "enrollment_no": "CS2025010",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Durability Test",
            "guardian_contact": "1111111111",
        },
    )
    tm.commit(tx)

    # Persist to disk (simulates checkpoint / graceful shutdown)
    rm = RecoveryManager(db, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    rm.persist_all_tables()

    # Verify data is on disk
    students, _ = db.get_table("hostel_db", "students")
    assert students.get(10) is not None, (
        "Durability: student_id=10 not found before restart"
    )
    print("  Committed student_id=10 exists before restart")

    # STEP 2: Simulate restart - create a new DatabaseManager and load from disk
    print("  Simulating system restart...")
    db2 = fresh_db()  # fresh empty tables
    rm2 = RecoveryManager(db2, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    rm2.load_all_tables()

    # STEP 3: Verify committed data survived the restart
    students2, _ = db2.get_table("hostel_db", "students")
    record = students2.get(10)
    assert record is not None, "Durability: student_id=10 lost after restart"
    assert record["enrollment_no"] == "CS2025010", (
        "Durability: record data corrupted after restart"
    )
    assert record["guardian_name"] == "Durability Test", (
        "Durability: record data corrupted"
    )
    print("  student_id=10 found after restart with correct data")

    # Verify original data also survived
    assert students2.get(3) is not None, "Durability: original student_id=3 lost"
    assert students2.get(5) is not None, "Durability: original student_id=5 lost"
    print("  Original data (student_id=3, 5) also preserved")

    print("[PASS] Committed data persists after restart (durability verified)")


# ---------------------------------------------------------------------------
# Test 2: Atomicity - crash mid-transaction, verify rollback on recovery
# ---------------------------------------------------------------------------


def test_atomicity_crash():
    print("\n--- Test 2: ATOMICITY (crash mid-transaction, rollback on recovery) ---")
    clean_test_dir()

    # STEP 1: Create database, commit a transaction, persist
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=get_wal_dir())

    tx1 = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    tm.tx_insert(
        tx1,
        "hostel_db",
        "students",
        {
            "student_id": 20,
            "enrollment_no": "CS2025020",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Atomicity Test",
            "guardian_contact": "2222222222",
        },
    )
    tm.commit(tx1)

    # Persist committed state
    rm = RecoveryManager(db, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    rm.persist_all_tables()
    print("  Committed student_id=20 and persisted to disk")

    # STEP 2: Start a new transaction and make changes - then CRASH (no commit, no persist)
    tm2 = TransactionManager(db, wal_dir=get_wal_dir())

    tx2 = tm2.begin("hostel_db", ["students", "rooms", "allocations"])
    tm2.tx_insert(
        tx2,
        "hostel_db",
        "students",
        {
            "student_id": 99,
            "enrollment_no": "CRASH0001",
            "course": "Crash Test",
            "batch_year": 2099,
            "guardian_name": "Crash Victim",
            "guardian_contact": "9999999999",
        },
    )
    tm2.tx_update(
        tx2,
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
    print("  Made changes in transaction (no commit) - simulating crash")

    # CRASH: process dies, no commit, no persist. The live B+ Trees have
    # the uncommitted changes, but they were never saved to disk.

    # STEP 3: Recovery - restart and run recovery
    print("  Running crash recovery...")
    db3 = fresh_db()  # fresh empty tables
    rm3 = RecoveryManager(db3, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    report = rm3.recover()

    # STEP 4: Verify committed data survived
    students3, _ = db3.get_table("hostel_db", "students")
    assert students3.get(20) is not None, (
        "Atomicity: committed student_id=20 lost after recovery"
    )
    print("  Committed student_id=20 still present after recovery")

    # STEP 5: Verify uncommitted changes were rolled back
    assert students3.get(99) is None, (
        "Atomicity: uncommitted student_id=99 survived recovery"
    )
    rooms3, _ = db3.get_table("hostel_db", "rooms")
    assert rooms3.get(1)["current_occupancy"] == 1, (
        "Atomicity: uncommitted room change survived"
    )
    print("  Uncommitted student_id=99 rolled back")
    print("  Uncommitted room occupancy change rolled back")

    print(
        f"  Recovery report: {report['transactions_undone']} undone, {report['transactions_redone']} redone"
    )
    print(
        "[PASS] Crash mid-transaction fully rolled back on recovery (atomicity verified)"
    )


# ---------------------------------------------------------------------------
# Test 3: Consistency - B+ Tree remains consistent after recovery
# ---------------------------------------------------------------------------


def test_consistency_after_recovery():
    print("\n--- Test 3: CONSISTENCY (B+ Tree integrity after recovery) ---")
    clean_test_dir()

    # STEP 1: Create and persist data
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=get_wal_dir())

    tx = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    tm.tx_insert(
        tx,
        "hostel_db",
        "students",
        {
            "student_id": 30,
            "enrollment_no": "CS2025030",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Consistency Test",
            "guardian_contact": "3333333333",
        },
    )
    tm.tx_insert(
        tx,
        "hostel_db",
        "students",
        {
            "student_id": 40,
            "enrollment_no": "CS2025040",
            "course": "B.Tech EE",
            "batch_year": 2025,
            "guardian_name": "Consistency Test 2",
            "guardian_contact": "4444444444",
        },
    )
    tm.commit(tx)

    rm = RecoveryManager(db, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    rm.persist_all_tables()
    print("  Committed 2 students and persisted")

    # STEP 2: Restart and recover
    db2 = fresh_db()
    rm2 = RecoveryManager(db2, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    rm2.load_all_tables()

    students, _ = db2.get_table("hostel_db", "students")
    all_records = students.get_all()

    # STEP 3: Verify B+ Tree consistency
    keys = [k for k, _ in all_records]
    assert keys == sorted(keys), "Consistency: keys not sorted after recovery"
    print(f"  Keys in sorted order: {keys}")

    # Verify range query works (tests leaf linked-list integrity)
    range_results = students.range_query(3, 30)
    assert len(range_results) >= 1, "Consistency: range query failed after recovery"
    print(f"  Range query [3, 30] returned {len(range_results)} records")

    # Verify all records are retrievable by key
    for key, record in all_records:
        fetched = students.get(key)
        assert fetched is not None, (
            f"Consistency: key={key} not retrievable after recovery"
        )
        assert fetched == record, f"Consistency: key={key} data mismatch after recovery"
    print(f"  All {len(all_records)} records retrievable and consistent")

    print("[PASS] B+ Tree remains fully consistent after recovery")


# ---------------------------------------------------------------------------
# Test 4: Full recovery scenario - commit, crash, recover, verify
# ---------------------------------------------------------------------------


def test_full_recovery_scenario():
    print("\n--- Test 4: FULL RECOVERY SCENARIO ---")
    clean_test_dir()

    # Phase 1: Normal operation - commit and persist
    print("  Phase 1: Normal operation")
    db = fresh_db()
    tm = TransactionManager(db, wal_dir=get_wal_dir())

    tx1 = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    tm.tx_insert(
        tx1,
        "hostel_db",
        "students",
        {
            "student_id": 50,
            "enrollment_no": "CS2025050",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Recovery Test",
            "guardian_contact": "5555555555",
        },
    )
    tm.commit(tx1)

    rm = RecoveryManager(db, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    rm.persist_all_tables()
    print("    Committed student_id=50, persisted to disk")

    # Phase 2: Crash mid-transaction
    print("  Phase 2: Crash mid-transaction")
    tm2 = TransactionManager(db, wal_dir=get_wal_dir())
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
            "guardian_contact": "0000000000",
        },
    )
    # CRASH - no commit
    print("    Started transaction, inserted student_id=999, CRASH (no commit)")

    # Phase 3: Recovery
    print("  Phase 3: Recovery")
    db3 = fresh_db()
    rm3 = RecoveryManager(db3, wal_dir=get_wal_dir(), data_dir=get_data_dir())
    report = rm3.recover()

    students, _ = db3.get_table("hostel_db", "students")

    # Verify
    assert students.get(50) is not None, "FullRecovery: committed student_id=50 lost"
    assert students.get(999) is None, (
        "FullRecovery: uncommitted student_id=999 survived"
    )
    assert students.get(3) is not None, "FullRecovery: original student_id=3 lost"
    print("    student_id=50 (committed): PRESENT")
    print("    student_id=999 (uncommitted): ROLLED BACK")
    print("    student_id=3 (original): PRESENT")

    print(
        f"  Recovery report: undone={report['transactions_undone']}, redone={report['transactions_redone']}"
    )
    print(
        "[PASS] Full recovery scenario: committed data preserved, uncommitted rolled back"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print("=" * 70)
    print("ASSIGNMENT 3 - MODULE A: Crash Recovery Tests")
    print("=" * 70)

    test_durability()
    test_atomicity_crash()
    test_consistency_after_recovery()
    test_full_recovery_scenario()

    print("\n" + "=" * 70)
    print("All 4 crash recovery tests passed.")
    print("=" * 70)


if __name__ == "__main__":
    main()
