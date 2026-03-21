"""
SQL Indexing Benchmark - CheckInOut Hostel Management System
Compares query performance before and after adding indexes on a large synthetic dataset.
"""

import sqlite3
import time
import random
import json
import os
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

DB_PATH = "/tmp/checkinout_bench.db"
RUNS = 100  # times each query is executed per measurement

# ── Schema ────────────────────────────────────────────────────────────────────

SCHEMA = """
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS member (
    member_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, email TEXT NOT NULL, contact_number TEXT NOT NULL,
    age INTEGER NOT NULL, gender TEXT NOT NULL, address TEXT,
    profile_image TEXT, user_type TEXT NOT NULL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS student (
    student_id INTEGER PRIMARY KEY,
    enrollment_no TEXT NOT NULL UNIQUE, course TEXT NOT NULL,
    batch_year INTEGER NOT NULL, guardian_name TEXT NOT NULL, guardian_contact TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS staff (
    staff_id INTEGER PRIMARY KEY,
    designation TEXT NOT NULL, shift_start TEXT NOT NULL,
    shift_end TEXT NOT NULL, is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hostel_block (
    block_id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_name TEXT NOT NULL, type TEXT NOT NULL, total_floors INTEGER NOT NULL, warden_id INTEGER
);
CREATE TABLE IF NOT EXISTS room (
    room_id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL, room_number TEXT NOT NULL,
    floor_number INTEGER NOT NULL, capacity INTEGER NOT NULL,
    current_occupancy INTEGER DEFAULT 0, type TEXT DEFAULT 'Non-AC', status TEXT DEFAULT 'Available'
);
CREATE TABLE IF NOT EXISTS allocation (
    allocation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL, room_id INTEGER NOT NULL,
    check_in_date TEXT NOT NULL, check_out_date TEXT,
    status TEXT DEFAULT 'Active'
);
CREATE TABLE IF NOT EXISTS gate_pass (
    pass_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL, out_time TEXT NOT NULL,
    expected_in_time TEXT NOT NULL, actual_in_time TEXT,
    reason TEXT NOT NULL, status TEXT DEFAULT 'Pending', approver_id INTEGER
);
CREATE TABLE IF NOT EXISTS maintenance_request (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER, reported_by INTEGER NOT NULL,
    title TEXT NOT NULL, description TEXT NOT NULL,
    priority TEXT DEFAULT 'Medium', status TEXT DEFAULT 'Open',
    reported_date TEXT, resolved_date TEXT, resolved_by INTEGER
);
CREATE TABLE IF NOT EXISTS fee_payment (
    payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL, amount REAL NOT NULL,
    payment_date TEXT NOT NULL, payment_type TEXT NOT NULL,
    transaction_id TEXT UNIQUE, status TEXT DEFAULT 'Pending'
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user', member_id INTEGER, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS audit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL, action TEXT NOT NULL,
    record_id INTEGER NOT NULL, performed_by INTEGER NOT NULL,
    timestamp INTEGER, details TEXT
);
"""

INDEXES = [
    ("idx_allocation_student_id",  "CREATE INDEX idx_allocation_student_id ON allocation(student_id)"),
    ("idx_allocation_status",       "CREATE INDEX idx_allocation_status ON allocation(status)"),
    ("idx_gate_pass_student_id",    "CREATE INDEX idx_gate_pass_student_id ON gate_pass(student_id)"),
    ("idx_gate_pass_status",        "CREATE INDEX idx_gate_pass_status ON gate_pass(status)"),
    ("idx_maintenance_status",      "CREATE INDEX idx_maintenance_status ON maintenance_request(status)"),
    ("idx_maintenance_room_id",     "CREATE INDEX idx_maintenance_room_id ON maintenance_request(room_id)"),
    ("idx_audit_performed_by",      "CREATE INDEX idx_audit_performed_by ON audit_log(performed_by)"),
    ("idx_fee_student_id",          "CREATE INDEX idx_fee_student_id ON fee_payment(student_id)"),
    ("idx_alloc_student_status",    "CREATE INDEX idx_alloc_student_status ON allocation(student_id, status)"),
]

QUERIES = [
    {
        "name": "Allocations by student",
        "sql": "SELECT * FROM allocation WHERE student_id = ?",
        "param": lambda: random.randint(1, 500),
        "table": "allocation",
    },
    {
        "name": "Active allocations",
        "sql": "SELECT * FROM allocation WHERE status = 'Active'",
        "param": lambda: None,
        "table": "allocation",
    },
    {
        "name": "Gate passes by student",
        "sql": "SELECT * FROM gate_pass WHERE student_id = ?",
        "param": lambda: random.randint(1, 500),
        "table": "gate_pass",
    },
    {
        "name": "Pending gate passes",
        "sql": "SELECT * FROM gate_pass WHERE status = 'Pending'",
        "param": lambda: None,
        "table": "gate_pass",
    },
    {
        "name": "Open maintenance requests",
        "sql": "SELECT * FROM maintenance_request WHERE status = 'Open'",
        "param": lambda: None,
        "table": "maintenance_request",
    },
    {
        "name": "Maintenance by room",
        "sql": "SELECT * FROM maintenance_request WHERE room_id = ?",
        "param": lambda: random.randint(1, 200),
        "table": "maintenance_request",
    },
    {
        "name": "Audit log by user",
        "sql": "SELECT * FROM audit_log WHERE performed_by = ?",
        "param": lambda: random.randint(1, 50),
        "table": "audit_log",
    },
    {
        "name": "Fee payments by student",
        "sql": "SELECT * FROM fee_payment WHERE student_id = ?",
        "param": lambda: random.randint(1, 500),
        "table": "fee_payment",
    },
]

# ── Seed data ─────────────────────────────────────────────────────────────────

def seed(conn):
    print("Seeding large dataset...")
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL")
    cur.execute("PRAGMA synchronous = OFF")

    N_STUDENTS = 500
    N_ROOMS    = 200
    N_USERS    = 50

    statuses_alloc  = ["Active", "Completed", "Cancelled"]
    statuses_gate   = ["Pending", "Approved", "Rejected", "Closed"]
    statuses_maint  = ["Open", "In_Progress", "Resolved"]
    priorities      = ["Low", "Medium", "High", "Emergency"]
    pay_types       = ["Hostel_Fee", "Mess_Fee", "Fine", "Security_Deposit"]
    actions         = ["INSERT", "UPDATE", "DELETE"]
    tables          = ["allocation", "gate_pass", "maintenance_request", "fee_payment"]

    # members + students
    cur.executemany(
        "INSERT INTO member (name, email, contact_number, age, gender, user_type) VALUES (?,?,?,?,?,?)",
        [(f"Student {i}", f"s{i}@test.com", f"99{i:08d}", 18 + i % 10, "Male", "Student")
         for i in range(1, N_STUDENTS + 1)]
    )
    cur.executemany(
        "INSERT INTO student (student_id, enrollment_no, course, batch_year, guardian_name, guardian_contact) VALUES (?,?,?,?,?,?)",
        [(i, f"EN{i:05d}", "B.Tech CSE", 2020 + i % 4, f"Guardian {i}", f"88{i:08d}")
         for i in range(1, N_STUDENTS + 1)]
    )

    # hostel blocks + rooms
    cur.executemany(
        "INSERT INTO hostel_block (block_name, type, total_floors) VALUES (?,?,?)",
        [(f"Block {chr(65+i)}", "Boys", 5) for i in range(10)]
    )
    cur.executemany(
        "INSERT INTO room (block_id, room_number, floor_number, capacity) VALUES (?,?,?,?)",
        [(random.randint(1, 10), f"R{i:03d}", random.randint(1, 5), 4)
         for i in range(1, N_ROOMS + 1)]
    )

    # users
    cur.executemany(
        "INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
        [(f"user{i}", "hash", "user") for i in range(1, N_USERS + 1)]
    )

    # allocations - 50k rows
    cur.executemany(
        "INSERT INTO allocation (student_id, room_id, check_in_date, status) VALUES (?,?,?,?)",
        [(random.randint(1, N_STUDENTS), random.randint(1, N_ROOMS),
          "2024-01-01", random.choice(statuses_alloc))
         for _ in range(50_000)]
    )

    # gate passes - 50k rows
    cur.executemany(
        "INSERT INTO gate_pass (student_id, out_time, expected_in_time, reason, status) VALUES (?,?,?,?,?)",
        [(random.randint(1, N_STUDENTS), "2024-06-01 08:00",
          "2024-06-01 20:00", "Personal", random.choice(statuses_gate))
         for _ in range(50_000)]
    )

    # maintenance requests - 20k rows
    cur.executemany(
        "INSERT INTO maintenance_request (room_id, reported_by, title, description, priority, status) VALUES (?,?,?,?,?,?)",
        [(random.randint(1, N_ROOMS), random.randint(1, N_STUDENTS),
          "Issue", "Details", random.choice(priorities), random.choice(statuses_maint))
         for _ in range(20_000)]
    )

    # fee payments - 50k rows
    cur.executemany(
        "INSERT INTO fee_payment (student_id, amount, payment_date, payment_type, status) VALUES (?,?,?,?,?)",
        [(random.randint(1, N_STUDENTS), random.uniform(1000, 50000),
          "2024-01-15", random.choice(pay_types), "Success")
         for _ in range(50_000)]
    )

    # audit log - 100k rows
    cur.executemany(
        "INSERT INTO audit_log (table_name, action, record_id, performed_by) VALUES (?,?,?,?)",
        [(random.choice(tables), random.choice(actions),
          random.randint(1, 10000), random.randint(1, N_USERS))
         for _ in range(100_000)]
    )

    conn.commit()
    print("Seeding complete.")


# ── Benchmarking ──────────────────────────────────────────────────────────────

def explain(conn, sql, param):
    cur = conn.cursor()
    if param is not None:
        rows = cur.execute(f"EXPLAIN QUERY PLAN {sql}", (param,)).fetchall()
    else:
        rows = cur.execute(f"EXPLAIN QUERY PLAN {sql}").fetchall()
    return " | ".join(str(r) for r in rows)


def measure(conn, sql, param_fn):
    times = []
    for _ in range(RUNS):
        param = param_fn()
        t0 = time.perf_counter()
        if param is not None:
            conn.execute(sql, (param,)).fetchall()
        else:
            conn.execute(sql).fetchall()
        times.append((time.perf_counter() - t0) * 1000)  # ms
    return sum(times) / len(times)


def run_benchmark(conn):
    results = []
    for q in QUERIES:
        param = q["param"]()
        explain_plan = explain(conn, q["sql"], param)
        avg_ms = measure(conn, q["sql"], q["param"])
        results.append({
            "name": q["name"],
            "sql": q["sql"],
            "explain": explain_plan,
            "avg_ms": round(avg_ms, 4),
        })
    return results


# ── Plots ─────────────────────────────────────────────────────────────────────

def plot(before, after, out_path):
    names   = [r["name"] for r in before]
    t_before = [r["avg_ms"] for r in before]
    t_after  = [r["avg_ms"] for r in after]
    speedups = [b / a if a > 0 else 1 for b, a in zip(t_before, t_after)]

    x = range(len(names))
    width = 0.38

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))
    fig.patch.set_facecolor("#1a1a1a")
    for ax in (ax1, ax2):
        ax.set_facecolor("#1a1a1a")
        ax.tick_params(colors="#cccccc", labelsize=8)
        ax.xaxis.label.set_color("#cccccc")
        ax.yaxis.label.set_color("#cccccc")
        ax.title.set_color("#ff6600")
        for spine in ax.spines.values():
            spine.set_edgecolor("#333333")

    # Bar chart
    bars_b = ax1.bar([i - width/2 for i in x], t_before, width, label="Before index",
                     color="#555555", edgecolor="#333333")
    bars_a = ax1.bar([i + width/2 for i in x], t_after,  width, label="After index",
                     color="#ff6600", edgecolor="#cc4400")
    ax1.set_xticks(list(x))
    ax1.set_xticklabels(names, rotation=30, ha="right", fontsize=7)
    ax1.set_ylabel("Avg query time (ms)")
    ax1.set_title("Query Time: Before vs After Index")
    ax1.legend(facecolor="#2a2a2a", labelcolor="#cccccc", fontsize=8)
    ax1.yaxis.set_major_formatter(ticker.FormatStrFormatter("%.2f"))

    # Speedup chart
    colors = ["#ff6600" if s >= 2 else "#ff9944" if s >= 1.2 else "#888888" for s in speedups]
    ax2.bar(x, speedups, color=colors, edgecolor="#333333")
    ax2.axhline(y=1, color="#555555", linestyle="--", linewidth=0.8)
    ax2.set_xticks(list(x))
    ax2.set_xticklabels(names, rotation=30, ha="right", fontsize=7)
    ax2.set_ylabel("Speedup factor (×)")
    ax2.set_title("Speedup Factor After Indexing")

    plt.tight_layout(pad=2)
    plt.savefig(out_path, dpi=150, bbox_inches="tight", facecolor="#1a1a1a")
    plt.close()
    print(f"Plot saved to {out_path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    seed(conn)

    print("\n── Benchmarking WITHOUT indexes ──")
    before = run_benchmark(conn)
    for r in before:
        print(f"  {r['name']:<35} {r['avg_ms']:.4f} ms")
        print(f"    EXPLAIN: {r['explain']}")

    print("\n── Creating indexes ──")
    for name, ddl in INDEXES:
        conn.execute(ddl)
        print(f"  created: {name}")
    conn.commit()

    print("\n── Benchmarking WITH indexes ──")
    after = run_benchmark(conn)
    for r in after:
        print(f"  {r['name']:<35} {r['avg_ms']:.4f} ms")
        print(f"    EXPLAIN: {r['explain']}")

    conn.close()

    # Save results
    out_dir = os.path.dirname(os.path.abspath(__file__))
    results = {"before": before, "after": after}
    json_path = os.path.join(out_dir, "benchmark_results.json")
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {json_path}")

    plot_path = os.path.join(out_dir, "benchmark_plot.png")
    plot(before, after, plot_path)

    # Print summary table
    print("\n── Summary ──────────────────────────────────────────────────────────────")
    print(f"  {'Query':<35} {'Before (ms)':>12} {'After (ms)':>12} {'Speedup':>10}")
    print(f"  {'-'*35} {'-'*12} {'-'*12} {'-'*10}")
    for b, a in zip(before, after):
        speedup = b['avg_ms'] / a['avg_ms'] if a['avg_ms'] > 0 else float('inf')
        print(f"  {b['name']:<35} {b['avg_ms']:>12.4f} {a['avg_ms']:>12.4f} {speedup:>9.2f}x")


if __name__ == "__main__":
    main()
