"""
Setup demo for Assignment 3 - Module A
========================================
Initializes three relations (Student, Room, Allocation) as separate B+ Trees
via the DatabaseManager, seeds them with data from Assignment 1, and verifies
that all data lives exclusively inside the B+ Trees.

Run:  python setup_demo.py
"""

import sys
import os

# Ensure the database/ package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "database"))

from db_manager import DatabaseManager


# ---------------------------------------------------------------------------
# STEP 1: Create database and three tables
# ---------------------------------------------------------------------------


def create_hostel_database():
    """Create the hostel_db with Student, Room, and Allocation tables."""
    db = DatabaseManager()

    ok, msg = db.create_database("hostel_db")
    assert ok, f"CreateDatabase: {msg}"
    print(f"[OK] {msg}")

    # Student - primary key: student_id (int)
    student_schema = {
        "student_id": int,
        "enrollment_no": str,
        "course": str,
        "batch_year": int,
        "guardian_name": str,
        "guardian_contact": str,
    }
    ok, msg = db.create_table(
        "hostel_db",
        "students",
        student_schema,
        order=8,
        search_key="student_id",
    )
    assert ok, f"CreateTable(students): {msg}"
    print(f"[OK] {msg}")

    # Room - primary key: room_id (int)
    room_schema = {
        "room_id": int,
        "block_id": int,
        "room_number": str,
        "floor_number": int,
        "capacity": int,
        "current_occupancy": int,
        "room_type": str,
        "status": str,
    }
    ok, msg = db.create_table(
        "hostel_db",
        "rooms",
        room_schema,
        order=8,
        search_key="room_id",
    )
    assert ok, f"CreateTable(rooms): {msg}"
    print(f"[OK] {msg}")

    # Allocation - primary key: allocation_id (int)
    allocation_schema = {
        "allocation_id": int,
        "student_id": int,
        "room_id": int,
        "check_in_date": str,
        "check_out_date": str,
        "status": str,
    }
    ok, msg = db.create_table(
        "hostel_db",
        "allocations",
        allocation_schema,
        order=8,
        search_key="allocation_id",
    )
    assert ok, f"CreateTable(allocations): {msg}"
    print(f"[OK] {msg}")

    return db


# ---------------------------------------------------------------------------
# STEP 2: Seed data from Assignment 1 (module_a.sql)
# ---------------------------------------------------------------------------

STUDENT_DATA = [
    {
        "student_id": 3,
        "enrollment_no": "CS2023001",
        "course": "B.Tech CSE",
        "batch_year": 2023,
        "guardian_name": "Raj Sharma",
        "guardian_contact": "8888888801",
    },
    {
        "student_id": 4,
        "enrollment_no": "CS2023002",
        "course": "B.Tech CSE",
        "batch_year": 2023,
        "guardian_name": "Vijay Singh",
        "guardian_contact": "8888888802",
    },
    {
        "student_id": 5,
        "enrollment_no": "ME2022001",
        "course": "B.Tech ME",
        "batch_year": 2022,
        "guardian_name": "Ajay Verma",
        "guardian_contact": "8888888803",
    },
    {
        "student_id": 6,
        "enrollment_no": "EE2023005",
        "course": "B.Tech EE",
        "batch_year": 2023,
        "guardian_name": "Sanjay Gupta",
        "guardian_contact": "8888888804",
    },
    {
        "student_id": 8,
        "enrollment_no": "CS2021009",
        "course": "M.Tech CSE",
        "batch_year": 2021,
        "guardian_name": "Alok Mehta",
        "guardian_contact": "8888888805",
    },
    {
        "student_id": 9,
        "enrollment_no": "CV2024001",
        "course": "B.Tech Civil",
        "batch_year": 2024,
        "guardian_name": "Yash Johar",
        "guardian_contact": "8888888806",
    },
    {
        "student_id": 11,
        "enrollment_no": "EC2023010",
        "course": "B.Tech ECE",
        "batch_year": 2023,
        "guardian_name": "Ravi Hegde",
        "guardian_contact": "8888888807",
    },
    {
        "student_id": 12,
        "enrollment_no": "ME2022045",
        "course": "B.Tech ME",
        "batch_year": 2022,
        "guardian_name": "Boney Kapoor",
        "guardian_contact": "8888888808",
    },
    {
        "student_id": 13,
        "enrollment_no": "CS2024022",
        "course": "B.Tech CSE",
        "batch_year": 2024,
        "guardian_name": "Tony Kakkar",
        "guardian_contact": "8888888809",
    },
    {
        "student_id": 14,
        "enrollment_no": "PH2020003",
        "course": "PhD Physics",
        "batch_year": 2020,
        "guardian_name": "V. Koothrappali",
        "guardian_contact": "8888888810",
    },
]

ROOM_DATA = [
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
    {
        "room_id": 2,
        "block_id": 1,
        "room_number": "102",
        "floor_number": 1,
        "capacity": 2,
        "current_occupancy": 1,
        "room_type": "Non-AC",
        "status": "Available",
    },
    {
        "room_id": 3,
        "block_id": 1,
        "room_number": "201",
        "floor_number": 2,
        "capacity": 1,
        "current_occupancy": 1,
        "room_type": "AC",
        "status": "Full",
    },
    {
        "room_id": 4,
        "block_id": 1,
        "room_number": "202",
        "floor_number": 2,
        "capacity": 2,
        "current_occupancy": 0,
        "room_type": "AC",
        "status": "Available",
    },
    {
        "room_id": 5,
        "block_id": 2,
        "room_number": "G-101",
        "floor_number": 1,
        "capacity": 3,
        "current_occupancy": 3,
        "room_type": "Non-AC",
        "status": "Full",
    },
    {
        "room_id": 6,
        "block_id": 2,
        "room_number": "G-102",
        "floor_number": 1,
        "capacity": 2,
        "current_occupancy": 1,
        "room_type": "AC",
        "status": "Available",
    },
    {
        "room_id": 7,
        "block_id": 2,
        "room_number": "G-201",
        "floor_number": 2,
        "capacity": 2,
        "current_occupancy": 0,
        "room_type": "AC",
        "status": "Available",
    },
    {
        "room_id": 8,
        "block_id": 3,
        "room_number": "V-301",
        "floor_number": 3,
        "capacity": 1,
        "current_occupancy": 1,
        "room_type": "AC",
        "status": "Full",
    },
    {
        "room_id": 9,
        "block_id": 3,
        "room_number": "V-302",
        "floor_number": 3,
        "capacity": 1,
        "current_occupancy": 0,
        "room_type": "AC",
        "status": "Available",
    },
    {
        "room_id": 10,
        "block_id": 4,
        "room_number": "Y-101",
        "floor_number": 1,
        "capacity": 2,
        "current_occupancy": 0,
        "room_type": "Non-AC",
        "status": "Available",
    },
]

ALLOCATION_DATA = [
    {
        "allocation_id": 1,
        "student_id": 3,
        "room_id": 1,
        "check_in_date": "2023-08-01",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 2,
        "student_id": 5,
        "room_id": 1,
        "check_in_date": "2023-08-01",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 3,
        "student_id": 9,
        "room_id": 2,
        "check_in_date": "2024-01-15",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 4,
        "student_id": 14,
        "room_id": 3,
        "check_in_date": "2020-07-20",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 5,
        "student_id": 4,
        "room_id": 5,
        "check_in_date": "2023-08-01",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 6,
        "student_id": 6,
        "room_id": 5,
        "check_in_date": "2023-08-01",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 7,
        "student_id": 8,
        "room_id": 5,
        "check_in_date": "2021-08-01",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 8,
        "student_id": 11,
        "room_id": 6,
        "check_in_date": "2023-08-10",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 9,
        "student_id": 12,
        "room_id": 8,
        "check_in_date": "2022-08-01",
        "check_out_date": "",
        "status": "Active",
    },
    {
        "allocation_id": 10,
        "student_id": 13,
        "room_id": 2,
        "check_in_date": "2023-01-01",
        "check_out_date": "2023-12-31",
        "status": "Completed",
    },
]


def seed_tables(db):
    """Insert all Assignment 1 data into the three B+ Tree tables."""
    students, _ = db.get_table("hostel_db", "students")
    rooms, _ = db.get_table("hostel_db", "rooms")
    allocations, _ = db.get_table("hostel_db", "allocations")

    # Seed Students
    for record in STUDENT_DATA:
        ok, result = students.insert(record)
        assert ok, f"InsertStudent({record['student_id']}): {result}"
    print(f"[OK] Inserted {len(STUDENT_DATA)} students into B+ Tree")

    # Seed Rooms
    for record in ROOM_DATA:
        ok, result = rooms.insert(record)
        assert ok, f"InsertRoom({record['room_id']}): {result}"
    print(f"[OK] Inserted {len(ROOM_DATA)} rooms into B+ Tree")

    # Seed Allocations
    for record in ALLOCATION_DATA:
        ok, result = allocations.insert(record)
        assert ok, f"InsertAllocation({record['allocation_id']}): {result}"
    print(f"[OK] Inserted {len(ALLOCATION_DATA)} allocations into B+ Tree")


# ---------------------------------------------------------------------------
# STEP 3: Verify B+ Tree storage - data lives only in the trees
# ---------------------------------------------------------------------------


def verify_bplus_tree_storage(db):
    """
    Prove that:
    1. Each relation is stored as a separate B+ Tree.
    2. The primary key is the B+ Tree key.
    3. The complete record is the B+ Tree value.
    4. No separate copy of data exists outside the B+ Tree.
    """
    print("\n--- Verification: B+ Tree Storage ---")

    students, _ = db.get_table("hostel_db", "students")
    rooms, _ = db.get_table("hostel_db", "rooms")
    allocations, _ = db.get_table("hostel_db", "allocations")

    # 1. Each table wraps its own B+ Tree instance
    assert students.data is not rooms.data, (
        "Students and Rooms share the same B+ Tree - violation"
    )
    assert students.data is not allocations.data, (
        "Students and Allocations share the same B+ Tree - violation"
    )
    assert rooms.data is not allocations.data, (
        "Rooms and Allocations share the same B+ Tree - violation"
    )
    print("[OK] Each relation uses a separate B+ Tree instance")

    # 2. Primary key is the B+ Tree key - verify by searching
    for student in STUDENT_DATA:
        sid = student["student_id"]
        record = students.get(sid)
        assert record is not None, (
            f"VerifyStudent: student_id={sid} not found in B+ Tree"
        )
        assert record["student_id"] == sid, (
            f"VerifyStudent: key mismatch for student_id={sid}"
        )
    print(
        f"[OK] All {len(STUDENT_DATA)} students retrievable by primary key from B+ Tree"
    )

    for room in ROOM_DATA:
        rid = room["room_id"]
        record = rooms.get(rid)
        assert record is not None, f"VerifyRoom: room_id={rid} not found in B+ Tree"
        assert record["room_id"] == rid, f"VerifyRoom: key mismatch for room_id={rid}"
    print(f"[OK] All {len(ROOM_DATA)} rooms retrievable by primary key from B+ Tree")

    for alloc in ALLOCATION_DATA:
        aid = alloc["allocation_id"]
        record = allocations.get(aid)
        assert record is not None, (
            f"VerifyAllocation: allocation_id={aid} not found in B+ Tree"
        )
        assert record["allocation_id"] == aid, (
            f"VerifyAllocation: key mismatch for allocation_id={aid}"
        )
    print(
        f"[OK] All {len(ALLOCATION_DATA)} allocations retrievable by primary key from B+ Tree"
    )

    # 3. Complete record stored as value - check all fields present
    sample = students.get(3)
    expected_fields = set(STUDENT_DATA[0].keys())
    actual_fields = set(sample.keys())
    assert expected_fields == actual_fields, (
        f"VerifyRecord: field mismatch. Expected {expected_fields}, got {actual_fields}"
    )
    print("[OK] Complete records stored as B+ Tree values (all fields present)")

    # 4. No separate copy of data - the Table class only holds a BPlusTree
    #    and a schema dict. The .data attribute IS the B+ Tree; there is no
    #    secondary list or dict holding records.
    assert not hasattr(students, "records"), (
        "Students has a separate 'records' attribute - data duplication"
    )
    assert not hasattr(rooms, "records"), (
        "Rooms has a separate 'records' attribute - data duplication"
    )
    assert not hasattr(allocations, "records"), (
        "Allocations has a separate 'records' attribute - data duplication"
    )
    print("[OK] No separate copy of data exists outside the B+ Trees")

    # 5. B+ Tree internal consistency - get_all returns sorted keys
    all_students = students.get_all()
    keys = [k for k, _ in all_students]
    assert keys == sorted(keys), (
        "VerifyBPlusTree: student keys are not sorted in B+ Tree"
    )
    print("[OK] B+ Tree keys are in sorted order (internal consistency verified)")

    all_rooms = rooms.get_all()
    keys = [k for k, _ in all_rooms]
    assert keys == sorted(keys), "VerifyBPlusTree: room keys are not sorted in B+ Tree"
    print("[OK] B+ Tree room keys are in sorted order")

    all_allocs = allocations.get_all()
    keys = [k for k, _ in all_allocs]
    assert keys == sorted(keys), (
        "VerifyBPlusTree: allocation keys are not sorted in B+ Tree"
    )
    print("[OK] B+ Tree allocation keys are in sorted order")


# ---------------------------------------------------------------------------
# STEP 4: Print summary
# ---------------------------------------------------------------------------


def print_summary(db):
    """Print a readable summary of all three tables."""
    print("\n" + "=" * 70)
    print("ASSIGNMENT 3 - MODULE A: Base Setup Summary")
    print("=" * 70)

    for table_name, label in [
        ("students", "Students"),
        ("rooms", "Rooms"),
        ("allocations", "Allocations"),
    ]:
        table, _ = db.get_table("hostel_db", table_name)
        records = table.get_all()
        print(f"\n{label} ({len(records)} records in B+ Tree, order={table.order}):")
        for key, record in records:
            print(f"  key={key}  →  {record}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print("=" * 70)
    print("ASSIGNMENT 3 - MODULE A: Setting up 3 B+ Tree Relations")
    print("=" * 70)

    # Create and seed
    db = create_hostel_database()
    seed_tables(db)

    # Verify
    verify_bplus_tree_storage(db)

    # Summary
    print_summary(db)

    print("\n" + "=" * 70)
    print(
        "Phase 1 complete: 3 relations stored as separate B+ Trees, seeded, verified."
    )
    print("=" * 70)

    return db


if __name__ == "__main__":
    main()
