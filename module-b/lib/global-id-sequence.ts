import { sqlite } from "@/lib/db";
import { getNumShards, getShardDb } from "@/lib/shard-router";

type SequenceTableName =
  | "allocation"
  | "gate_pass"
  | "fee_payment"
  | "visit_log"
  | "maintenance_request";

interface SequenceConfig {
  sourceTable: string;
  primaryKeyColumn: string;
}

const SEQUENCE_CONFIG: Record<SequenceTableName, SequenceConfig> = {
  allocation: { sourceTable: "allocation", primaryKeyColumn: "allocation_id" },
  gate_pass: { sourceTable: "gate_pass", primaryKeyColumn: "pass_id" },
  fee_payment: { sourceTable: "fee_payment", primaryKeyColumn: "payment_id" },
  visit_log: { sourceTable: "visit_log", primaryKeyColumn: "visit_id" },
  maintenance_request: {
    sourceTable: "maintenance_request",
    primaryKeyColumn: "request_id",
  },
};

/**
 * Returns the next globally unique ID for a sharded table.
 * IDs are coordinated through the main sqlite.db so [id] routes remain unambiguous across shards.
 */
export function getNextGlobalId(tableName: SequenceTableName): number {
  ensureGlobalSequenceTable();

  const sequenceTransaction = sqlite.transaction((targetTableName: SequenceTableName) => {
    const existingRow = sqlite.prepare(
      "SELECT next_id FROM global_id_sequence WHERE table_name = ?",
    ).get(targetTableName) as { next_id: number } | undefined;

    if (!existingRow) {
      const initialNextId = getInitialNextId(targetTableName);
      sqlite.prepare(
        "INSERT INTO global_id_sequence (table_name, next_id) VALUES (?, ?)",
      ).run(targetTableName, initialNextId + 1);
      return initialNextId;
    }

    sqlite.prepare(
      "UPDATE global_id_sequence SET next_id = ? WHERE table_name = ?",
    ).run(existingRow.next_id + 1, targetTableName);

    return existingRow.next_id;
  });

  return sequenceTransaction(tableName);
}

/**
 * Creates the main-db global sequence table if it does not exist yet.
 */
function ensureGlobalSequenceTable(): void {
  sqlite.prepare(
    `CREATE TABLE IF NOT EXISTS global_id_sequence (
      table_name TEXT PRIMARY KEY,
      next_id INTEGER NOT NULL
    )`,
  ).run();
}

/**
 * Initializes a sequence from the current maximum primary key in the legacy main table.
 */
function getInitialNextId(tableName: SequenceTableName): number {
  const config = SEQUENCE_CONFIG[tableName];
  const mainDbMaxIdRow = sqlite.prepare(
    `SELECT COALESCE(MAX(${config.primaryKeyColumn}), 0) AS max_id FROM ${config.sourceTable}`,
  ).get() as { max_id: number };

  let maxId = mainDbMaxIdRow.max_id;
  for (let shardId = 0; shardId < getNumShards(); shardId++) {
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_${config.sourceTable}`;
    const shardMaxIdRow = shardDb.prepare(
      `SELECT COALESCE(MAX(${config.primaryKeyColumn}), 0) AS max_id FROM ${shardTable}`,
    ).get() as { max_id: number };
    maxId = Math.max(maxId, shardMaxIdRow.max_id);
  }

  return maxId + 1;
}
