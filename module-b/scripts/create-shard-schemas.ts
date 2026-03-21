/**
 * Creates shard database files with the correct table schemas and indexes.
 * Run: npx tsx scripts/create-shard-schemas.ts
 */

import path from "path";
import Database from "better-sqlite3";

const NUM_SHARDS = 3;

// Table schemas for each shard.
// These mirror the original Drizzle schema columns but use raw SQL.
const SHARD_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS shard_X_student (
    student_id INTEGER PRIMARY KEY,
    enrollment_no TEXT NOT NULL UNIQUE,
    course TEXT NOT NULL,
    batch_year INTEGER NOT NULL,
    guardian_name TEXT NOT NULL,
    guardian_contact TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shard_X_allocation (
    allocation_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    check_in_date TEXT NOT NULL,
    check_out_date TEXT,
    status TEXT DEFAULT 'Active'
  )`,
  `CREATE TABLE IF NOT EXISTS shard_X_gate_pass (
    pass_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    out_time TEXT NOT NULL,
    expected_in_time TEXT NOT NULL,
    actual_in_time TEXT,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    approver_id INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS shard_X_fee_payment (
    payment_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    transaction_id TEXT UNIQUE,
    status TEXT DEFAULT 'Pending'
  )`,
  `CREATE TABLE IF NOT EXISTS shard_X_visit_log (
    visit_id INTEGER PRIMARY KEY,
    visitor_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    check_in_time TEXT NOT NULL,
    check_out_time TEXT,
    purpose TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS shard_X_maintenance_request (
    request_id INTEGER PRIMARY KEY,
    room_id INTEGER,
    reported_by INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Open',
    reported_date TEXT,
    resolved_date TEXT,
    resolved_by INTEGER
  )`,
];

// Indexes for each shard.
const SHARD_INDEXES: string[] = [
  "CREATE INDEX IF NOT EXISTS idx_shard_X_allocation_student_id ON shard_X_allocation(student_id)",
  "CREATE INDEX IF NOT EXISTS idx_shard_X_allocation_status ON shard_X_allocation(status)",
  "CREATE INDEX IF NOT EXISTS idx_shard_X_gate_pass_student_id ON shard_X_gate_pass(student_id)",
  "CREATE INDEX IF NOT EXISTS idx_shard_X_gate_pass_status ON shard_X_gate_pass(status)",
  "CREATE INDEX IF NOT EXISTS idx_shard_X_maintenance_room_id ON shard_X_maintenance_request(room_id)",
  "CREATE INDEX IF NOT EXISTS idx_shard_X_maintenance_status ON shard_X_maintenance_request(status)",
  "CREATE INDEX IF NOT EXISTS idx_shard_X_fee_student_id ON shard_X_fee_payment(student_id)",
];

// Global ID sequence table — tracks next available ID per table within each shard.
const GLOBAL_ID_SEQUENCE_TABLE = `
CREATE TABLE IF NOT EXISTS global_id_sequence (
  table_name TEXT PRIMARY KEY,
  next_id INTEGER NOT NULL
)`;

function getShardDbPath(shardId: number): string {
  return path.join(process.cwd(), "src", "db", `shard_${shardId}.db`);
}

function createShard(shardId: number): void {
  const dbPath = getShardDbPath(shardId);
  console.log(`Creating shard_${shardId} at ${dbPath}...`);

  // Open (creates the file if it doesn't exist).
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Create tables — replace shard_X_ prefix with the actual shard prefix.
  for (const sql of SHARD_TABLES) {
    const tableSql = sql.replaceAll("shard_X_", `shard_${shardId}_`);
    db.exec(tableSql);
  }

  // Create global_id_sequence table.
  db.exec(GLOBAL_ID_SEQUENCE_TABLE);

  // Create indexes.
  for (const sql of SHARD_INDEXES) {
    const indexSql = sql.replaceAll("shard_X_", `shard_${shardId}_`);
    db.exec(indexSql);
  }

  db.close();
  console.log(`  shard_${shardId} created with 6 sharded tables.`);
}

function main(): void {
  console.log("=== Creating Shard Databases ===\n");

  for (let i = 0; i < NUM_SHARDS; i++) {
    createShard(i);
  }

  console.log("\n=== All shard databases created. ===");
}

main();
