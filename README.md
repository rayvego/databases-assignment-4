# CS432 - Databases | Assignment 4 | Track 1
### CheckInOut - Hostel Management System
**Mohit Kamlesh Panchal - 23110208**

---

## Module A - Transaction Engine & Crash Recovery

Extends the Assignment 2 B+ Tree DBMS with full ACID transaction support, write-ahead logging, and crash recovery.

| What | Where |
|---|---|
| B+ Tree implementation | `module-a/database/bplustree.py` |
| Table & DatabaseManager | `module-a/database/table.py`, `module-a/database/db_manager.py` |
| Transaction Manager (BEGIN/COMMIT/ROLLBACK) | `module-a/transaction_manager.py` |
| Write-Ahead Log (WAL) | `module-a/write_ahead_log.py` |
| Crash Recovery | `module-a/recovery_manager.py` |
| B+ Tree persistence (JSON serialization) | `module-a/bplus_persistence.py` |
| Base setup demo (3 B+ Tree relations) | `module-a/setup_demo.py` |
| Transaction tests | `module-a/test_transactions.py` |
| ACID validation experiments | `module-a/test_acid_validation.py` |
| Crash recovery tests | `module-a/test_recovery.py` |
| Report + visualisations + benchmarks (Assignment 2) | `module-a/report.ipynb` |

---

## Module B - Sharded Application

Extends the Assignment 3 Next.js API with horizontal scaling through hash-based sharding.

| What | Where |
|---|---|
| API routes (CRUD) — sharded | `module-b/app/api/` |
| Shard router (routing logic) | `module-b/lib/shard-router.ts` |
| Auth (JWT + bcrypt) | `module-b/lib/auth.ts` |
| RBAC middleware | `module-b/lib/middleware.ts` |
| Audit logging | `module-b/lib/audit.ts` |
| Database schema (Drizzle) | `module-b/lib/db/schema.ts` |
| Shard databases | `module-b/src/db/shard_0.db`, `shard_1.db`, `shard_2.db` |
| Schema creation script | `module-b/scripts/create-shard-schemas.ts` |
| Data migration script | `module-b/scripts/migrate-data-to-shards.ts` |
| Verification script | `module-b/scripts/verify-sharding.ts` |
| SQL indexes | `module-b/sql/indexes.sql` |
| Benchmark script | `module-b/sql/benchmark.py` |
| Concurrent user simulation | `module-b/stress/concurrent_test.py` |
| Race condition test | `module-b/stress/race_condition_test.py` |
| Failure simulation | `module-b/stress/failure_simulation.py` |
| Stress test | `module-b/stress/stress_test.py` |
| Stress test results | `module-b/stress/results/` |

### Sharding Design

- **Shard key:** `student_id` (or `reported_by` for maintenance requests)
- **Strategy:** Hash-based — `shard_id = student_id % 3`
- **Simulation:** 3 separate SQLite files (`shard_0.db`, `shard_1.db`, `shard_2.db`)
- **Sharded tables:** `student`, `allocation`, `gate_pass`, `fee_payment`, `visit_log`, `maintenance_request`
- **Global tables (unsharded):** `member`, `staff`, `users`, `hostel_block`, `room`, `visitor`, `audit_log`
- **Routing:** Single-student lookups → 1 shard. List/range queries → fan out to all 3 shards.

---

## Reports

- `report.md` — Assignment 4 report: shard key justification, data partitioning, query routing, scalability trade-offs, limitations
- `group_cio_report.pdf` — Assignment 3 report: transactions, WAL, recovery, concurrent workload, race conditions, failure simulation, stress test
- `module-a/report.ipynb` — Assignment 2 report + visualisations + benchmarks
