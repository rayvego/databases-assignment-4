/**
 * Migrates existing data from the main sqlite.db into shard databases.
 * Idempotent: clears shard tables before inserting, so it can be re-run safely.
 * Run: npx tsx scripts/migrate-data-to-shards.ts
 */

import path from "path";
import Database from "better-sqlite3";

const NUM_SHARDS = 3;
const MAIN_DB_PATH = path.join(process.cwd(), "sqlite.db");

// Tables to migrate and their shard key column.
const MIGRATION_CONFIG: {
  sourceTable: string;
  shardTablePrefix: string;
  shardKeyColumn: string;
  // For tables where the shard key is not student_id.
  shardKeyColumnNameInSource?: string;
}[] = [
  {
    sourceTable: "student",
    shardTablePrefix: "shard_",
    shardKeyColumn: "student_id",
  },
  {
    sourceTable: "allocation",
    shardTablePrefix: "shard_",
    shardKeyColumn: "student_id",
  },
  {
    sourceTable: "gate_pass",
    shardTablePrefix: "shard_",
    shardKeyColumn: "student_id",
  },
  {
    sourceTable: "fee_payment",
    shardTablePrefix: "shard_",
    shardKeyColumn: "student_id",
  },
  {
    sourceTable: "visit_log",
    shardTablePrefix: "shard_",
    shardKeyColumn: "student_id",
  },
  {
    sourceTable: "maintenance_request",
    shardTablePrefix: "shard_",
    shardKeyColumn: "reported_by",
    shardKeyColumnNameInSource: "reported_by",
  },
];

function getShardDbPath(shardId: number): string {
  return path.join(process.cwd(), "src", "db", `shard_${shardId}.db`);
}

function getShardDb(shardId: number): Database.Database {
  return new Database(getShardDbPath(shardId));
}

interface ColumnInfo {
  name: string;
}

function migrateTable(
  mainDb: Database.Database,
  config: (typeof MIGRATION_CONFIG)[0],
): { sourceCount: number; shardCounts: number[] } {
  const sourceTable = config.sourceTable;
  const shardKeyColumnName = config.shardKeyColumnNameInSource ?? config.shardKeyColumn;

  console.log(`\nMigrating "${sourceTable}" (shard key: ${shardKeyColumnName})...`);

  // Get column names from source table.
  const columns = mainDb
    .prepare<unknown[], ColumnInfo>(`PRAGMA table_info(${sourceTable})`)
    .all();
  const columnNames = columns.map((c) => c.name);
  const columnList = columnNames.join(", ");
  const placeholderList = columnNames.map(() => "?").join(", ");

  // Read all rows from source.
  const rows = mainDb
    .prepare<unknown[], Record<string, unknown>>(`SELECT * FROM ${sourceTable}`)
    .all();

  const shardCounts = Array(NUM_SHARDS).fill(0);

  // Group rows by shard.
  const rowsByShard: Record<number, Record<string, unknown>[]> = {};
  for (let i = 0; i < NUM_SHARDS; i++) {
    rowsByShard[i] = [];
  }

  for (const row of rows) {
    const shardKeyValue = row[shardKeyColumnName] as number;
    const shardId = shardKeyValue % NUM_SHARDS;
    rowsByShard[shardId].push(row);
  }

  // Insert into each shard (clear existing data first for idempotency).
  for (let shardId = 0; shardId < NUM_SHARDS; shardId++) {
    const batch = rowsByShard[shardId];

    const db = getShardDb(shardId);
    const tableName = `shard_${shardId}_${sourceTable}`;

    // Clear existing data in this shard table before inserting.
    db.prepare(`DELETE FROM ${tableName}`).run();

    if (batch.length === 0) {
      console.log(`  shard_${shardId}: cleared, 0 rows to insert.`);
      db.close();
      continue;
    }

    const stmt = db.prepare(
      `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholderList})`,
    );

    const insertBatch = db.transaction((rowsBatch: Record<string, unknown>[]) => {
      for (const row of rowsBatch) {
        const values = columnNames.map((col) => row[col]);
        stmt.run(...values);
      }
    });
    insertBatch(batch);
    shardCounts[shardId] = batch.length;
    db.close();
  }

  console.log(
    `  Source: ${rows.length} rows → Shard counts: ${shardCounts.join(", ")}`,
  );

  return { sourceCount: rows.length, shardCounts };
}

function main(): void {
  console.log("=== Migrating Data to Shards ===\n");
  console.log("This script will CLEAR existing shard data and re-migrate from source tables.\n");

  const mainDb = new Database(MAIN_DB_PATH);
  mainDb.pragma("journal_mode = WAL");

  const results: {
    table: string;
    sourceCount: number;
    shardCounts: number[];
  }[] = [];

  for (const config of MIGRATION_CONFIG) {
    const result = migrateTable(mainDb, config);
    results.push({ table: config.sourceTable, ...result });
  }

  mainDb.close();

  // Verification: check for data loss.
  console.log("\n=== Verification ===");
  let allPassed = true;
  for (const result of results) {
    const totalShardRows = result.shardCounts.reduce((a, b) => a + b, 0);
    if (totalShardRows !== result.sourceCount) {
      console.log(
        `  FAIL: ${result.table} — source ${result.sourceCount} != shards ${totalShardRows}`,
      );
      allPassed = false;
    } else {
      console.log(
        `  OK: ${result.table} — ${result.sourceCount} rows, no loss.`,
      );
    }
  }

  if (allPassed) {
    console.log("\n✅ All tables migrated successfully. No data loss detected.");
  } else {
    console.log("\n❌ Migration errors detected. Review failures above.");
  }
}

main();
