"""
Transaction Manager Tests - Phase 2
====================================
Verifies BEGIN, COMMIT, and ROLLBACK across 3 B+ Tree tables.

Run:  python3 test_transactions.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "database"))

from db_manager import DatabaseManager
from transaction_manager import TransactionManager, TransactionError


# ---------------------------------------------------------------------------
# Helper: create a fresh database with 3 tables for each test
# ---------------------------------------------------------------------------


def fresh_db():
    """Return a DatabaseManager with students, rooms, allocations pre-seeded."""
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
# Test 1: BEGIN - transaction starts correctly
# ---------------------------------------------------------------------------


def test_begin():
    print("\n--- Test 1: BEGIN ---")
    db = fresh_db()
    tm = TransactionManager(db)

    tx_id = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    assert tx_id is not None, "Begin: returned None"
    assert tm.is_locked(), "Begin: isolation lock not acquired"

    tx = tm.get_transaction_state(tx_id)
    assert tx is not None, "Begin: transaction state not found"
    assert tx.state == "active", "Begin: state is not active"
    assert len(tx.table_names) == 3, "Begin: expected 3 tables"
    assert len(tx.snapshots) == 3, "Begin: expected 3 snapshots"

    print(f"[PASS] Transaction {tx_id} started with 3 tables, lock acquired")
    return db, tm, tx_id


# ---------------------------------------------------------------------------
# Test 2: COMMIT - changes persist after commit
# ---------------------------------------------------------------------------


def test_commit():
    print("\n--- Test 2: COMMIT ---")
    db, tm, tx_id = test_begin()

    students, _ = db.get_table("hostel_db", "students")
    rooms, _ = db.get_table("hostel_db", "rooms")
    allocations, _ = db.get_table("hostel_db", "allocations")

    # STEP 1: Perform multi-table operations within the transaction
    ok, result = tm.tx_insert(
        tx_id,
        "hostel_db",
        "students",
        {
            "student_id": 15,
            "enrollment_no": "CS2025001",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Test Guardian",
            "guardian_contact": "9999999999",
        },
    )
    assert ok, f"TxInsert: {result}"
    print(f"  Inserted student_id=15: {result}")

    ok, result = tm.tx_update(
        tx_id,
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
    assert ok, f"TxUpdate: {result}"
    print(f"  Updated room_id=1 occupancy to 2: {result}")

    ok, result = tm.tx_insert(
        tx_id,
        "hostel_db",
        "allocations",
        {
            "allocation_id": 2,
            "student_id": 15,
            "room_id": 1,
            "check_in_date": "2025-01-15",
            "check_out_date": "",
            "status": "Active",
        },
    )
    assert ok, f"TxInsert: {result}"
    print(f"  Inserted allocation_id=2: {result}")

    # STEP 2: Verify changes are visible in live trees before commit
    assert students.get(15) is not None, (
        "Commit: student_id=15 not visible before commit"
    )
    assert rooms.get(1)["current_occupancy"] == 2, "Commit: room occupancy not updated"
    assert allocations.get(2) is not None, "Commit: allocation_id=2 not visible"
    print("  Changes visible in live trees before commit")

    # STEP 3: Commit
    ok, msg = tm.commit(tx_id)
    assert ok, f"Commit: {msg}"
    print(f"  {msg}")

    # STEP 4: Verify changes persist after commit
    assert students.get(15) is not None, "Commit: student_id=15 lost after commit"
    assert rooms.get(1)["current_occupancy"] == 2, "Commit: room occupancy reverted"
    assert allocations.get(2) is not None, "Commit: allocation_id=2 lost"
    assert not tm.is_locked(), "Commit: lock still held"
    print("[PASS] All 3-table changes persisted after commit, lock released")


# ---------------------------------------------------------------------------
# Test 3: ROLLBACK - all changes undone
# ---------------------------------------------------------------------------


def test_rollback():
    print("\n--- Test 3: ROLLBACK ---")
    db = fresh_db()
    tm = TransactionManager(db)

    students, _ = db.get_table("hostel_db", "students")
    rooms, _ = db.get_table("hostel_db", "rooms")
    allocations, _ = db.get_table("hostel_db", "allocations")

    # Capture pre-transaction state
    pre_tx_students = students.get_all()
    pre_tx_rooms = rooms.get_all()
    pre_tx_allocs = allocations.get_all()

    tx_id = tm.begin("hostel_db", ["students", "rooms", "allocations"])

    # Make changes
    tm.tx_insert(
        tx_id,
        "hostel_db",
        "students",
        {
            "student_id": 99,
            "enrollment_no": "XX0000000",
            "course": "Test",
            "batch_year": 2099,
            "guardian_name": "Nobody",
            "guardian_contact": "0000000000",
        },
    )
    tm.tx_update(
        tx_id,
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
        tx_id,
        "hostel_db",
        "allocations",
        {
            "allocation_id": 99,
            "student_id": 99,
            "room_id": 1,
            "check_in_date": "2099-01-01",
            "check_out_date": "",
            "status": "Active",
        },
    )

    # Verify changes are visible before rollback
    assert students.get(99) is not None, (
        "Rollback: student_id=99 not visible before rollback"
    )
    assert rooms.get(1)["current_occupancy"] == 99, (
        "Rollback: occupancy not changed before rollback"
    )
    print("  Changes visible before rollback")

    # Rollback
    ok, msg = tm.rollback(tx_id)
    assert ok, f"Rollback: {msg}"
    print(f"  {msg}")

    # Verify all changes are undone
    post_tx_students = students.get_all()
    post_tx_rooms = rooms.get_all()
    post_tx_allocs = allocations.get_all()

    assert post_tx_students == pre_tx_students, (
        "Rollback: students changed after rollback"
    )
    assert post_tx_rooms == pre_tx_rooms, "Rollback: rooms changed after rollback"
    assert post_tx_allocs == pre_tx_allocs, (
        "Rollback: allocations changed after rollback"
    )
    assert students.get(99) is None, "Rollback: student_id=99 still exists"
    assert rooms.get(1)["current_occupancy"] == 1, (
        "Rollback: room occupancy not restored"
    )
    assert allocations.get(99) is None, "Rollback: allocation_id=99 still exists"
    assert not tm.is_locked(), "Rollback: lock still held"
    print("[PASS] All changes fully undone after rollback, state restored")


# ---------------------------------------------------------------------------
# Test 4: Isolation - concurrent transaction blocked
# ---------------------------------------------------------------------------


def test_isolation():
    print("\n--- Test 4: ISOLATION (serialized execution) ---")
    db = fresh_db()
    tm = TransactionManager(db)

    tx1 = tm.begin("hostel_db", ["students", "rooms", "allocations"])
    print(f"  Transaction 1 ({tx1}) started")

    # Try to start a second transaction while first is active
    try:
        tm.begin("hostel_db", ["students"])
        assert False, "Isolation: second transaction should have been blocked"
    except TransactionError as e:
        print(f"  Second transaction correctly blocked: {e}")

    # Commit first, then second should succeed
    tm.commit(tx1)
    tx2 = tm.begin("hostel_db", ["students"])
    print(f"  Transaction 2 ({tx2}) started after first committed")
    tm.commit(tx2)
    print("[PASS] Isolation enforced: only one active transaction at a time")


# ---------------------------------------------------------------------------
# Test 5: Error handling - invalid operations
# ---------------------------------------------------------------------------


def test_error_handling():
    print("\n--- Test 5: ERROR HANDLING ---")
    db = fresh_db()
    tm = TransactionManager(db)

    # Commit non-existent transaction
    try:
        tm.commit("nonexistent")
        assert False, "ErrorHandling: should have raised TransactionError"
    except TransactionError as e:
        print(f"  Commit nonexistent tx blocked: {e}")

    # Rollback non-existent transaction
    try:
        tm.rollback("nonexistent")
        assert False, "ErrorHandling: should have raised TransactionError"
    except TransactionError as e:
        print(f"  Rollback nonexistent tx blocked: {e}")

    # Operation on table not in transaction
    tx_id = tm.begin("hostel_db", ["students"])
    try:
        tm.tx_insert(tx_id, "hostel_db", "rooms", {"room_id": 99})
        assert False, "ErrorHandling: should have raised TransactionError"
    except TransactionError as e:
        print(f"  Operation on non-tx table blocked: {e}")
    tm.rollback(tx_id)

    # Operation after commit
    tx_id = tm.begin("hostel_db", ["students"])
    tm.commit(tx_id)
    try:
        tm.tx_insert(tx_id, "hostel_db", "students", {"student_id": 99})
        assert False, "ErrorHandling: should have raised TransactionError"
    except TransactionError as e:
        print(f"  Operation after commit blocked: {e}")

    print("[PASS] All error cases handled correctly")


# ---------------------------------------------------------------------------
# Test 6: Operation log
# ---------------------------------------------------------------------------


def test_operation_log():
    print("\n--- Test 6: OPERATION LOG ---")
    db = fresh_db()
    tm = TransactionManager(db)

    tx_id = tm.begin("hostel_db", ["students", "rooms", "allocations"])

    tm.tx_insert(
        tx_id,
        "hostel_db",
        "students",
        {
            "student_id": 20,
            "enrollment_no": "CS2025010",
            "course": "B.Tech CSE",
            "batch_year": 2025,
            "guardian_name": "Log Test",
            "guardian_contact": "1111111111",
        },
    )
    tm.tx_update(
        tx_id,
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
    tm.tx_delete(tx_id, "hostel_db", "allocations", 1)

    tm.commit(tx_id)

    log = tm.get_operation_log()
    assert len(log) == 3, f"OperationLog: expected 3 entries, got {len(log)}"
    assert log[0]["type"] == "INSERT", (
        f"OperationLog: expected INSERT, got {log[0]['type']}"
    )
    assert log[1]["type"] == "UPDATE", (
        f"OperationLog: expected UPDATE, got {log[1]['type']}"
    )
    assert log[2]["type"] == "DELETE", (
        f"OperationLog: expected DELETE, got {log[2]['type']}"
    )
    assert log[1]["old_value"]["current_occupancy"] == 1, (
        "OperationLog: old value not captured"
    )
    assert log[1]["new_value"]["current_occupancy"] == 2, (
        "OperationLog: new value not captured"
    )

    print("  Logged operations:")
    for entry in log:
        print(f"    {entry['type']} on {entry['table']} (key={entry['key']})")
    print("[PASS] Operation log correctly records all committed operations")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print("=" * 70)
    print("ASSIGNMENT 3 - MODULE A: Transaction Manager Tests")
    print("=" * 70)

    test_begin()
    test_commit()
    test_rollback()
    test_isolation()
    test_error_handling()
    test_operation_log()

    print("\n" + "=" * 70)
    print("All 6 transaction tests passed.")
    print("=" * 70)


if __name__ == "__main__":
    main()
