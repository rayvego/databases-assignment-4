-- CheckInOut Hostel Management System
-- SQL Indexes for Query Optimisation
-- Applied to: sqlite.db

-- Rationale:
-- Point-lookup queries (WHERE col = ?) benefit enormously from B+ Tree indexes.
-- Low-cardinality status columns (few distinct values, many rows per value) benefit
-- less from single-column indexes when returning a large fraction of the table -
-- SQLite may opt for a full scan anyway (see benchmark results for status queries).

-- allocation: most queried join table
CREATE INDEX IF NOT EXISTS idx_allocation_student_id   ON allocation(student_id);
CREATE INDEX IF NOT EXISTS idx_allocation_status        ON allocation(status);

-- Composite index covers "active allocations for a given student" in one seek
CREATE INDEX IF NOT EXISTS idx_alloc_student_status    ON allocation(student_id, status);

-- gate_pass: high-frequency student lookups + status filters
CREATE INDEX IF NOT EXISTS idx_gate_pass_student_id    ON gate_pass(student_id);
CREATE INDEX IF NOT EXISTS idx_gate_pass_status        ON gate_pass(status);

-- maintenance_request: room-based lookups and status filters
CREATE INDEX IF NOT EXISTS idx_maintenance_room_id     ON maintenance_request(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status      ON maintenance_request(status);

-- fee_payment: per-student fee history lookups
CREATE INDEX IF NOT EXISTS idx_fee_student_id          ON fee_payment(student_id);

-- audit_log: security queries by user
CREATE INDEX IF NOT EXISTS idx_audit_performed_by      ON audit_log(performed_by);
