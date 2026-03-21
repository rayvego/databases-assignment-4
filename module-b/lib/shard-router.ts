import path from "path";
import Database from "better-sqlite3";

const NUM_SHARDS = 3;

const SHARD_DB_PATHS: string[] = Array.from({ length: NUM_SHARDS }, (_, i) =>
  path.join(process.cwd(), "src", "db", `shard_${i}.db`),
);

// Cached shard DB connections — opened once, reused across requests.
let _shardDbs: Record<number, Database.Database> = {};

/**
 * Returns the shard ID (0, 1, or 2) for a given student_id.
 * Uses hash-based routing: studentId % NUM_SHARDS.
 */
export function getShardId(studentId: number): number {
  return studentId % NUM_SHARDS;
}

/**
 * Returns a better-sqlite3 Database connection for the given shard ID.
 * Connections are cached after first open.
 */
export function getShardDb(shardId: number): Database.Database {
  if (shardId < 0 || shardId >= NUM_SHARDS) {
    throw new Error(
      `GetShardDb: invalid shard ID ${shardId}. Must be between 0 and ${NUM_SHARDS - 1}.`,
    );
  }

  if (!_shardDbs[shardId]) {
    const dbPath = SHARD_DB_PATHS[shardId];
    _shardDbs[shardId] = new Database(dbPath);
    // Enable WAL mode for better concurrent read performance.
    _shardDbs[shardId].pragma("journal_mode = WAL");
  }

  return _shardDbs[shardId];
}

/**
 * Returns Database connections for all shards, ordered 0 to NUM_SHARDS-1.
 * Used for range/list queries that must fan out across all shards.
 */
export function getAllShardDbs(): Database.Database[] {
  return Array.from({ length: NUM_SHARDS }, (_, i) => getShardDb(i));
}

/**
 * Given a student_id, returns { db, shardId } for direct routing.
 * Used for single-student lookups and inserts.
 */
export function routeToShard(
  studentId: number,
): { db: Database.Database; shardId: number } {
  const shardId = getShardId(studentId);
  return { db: getShardDb(shardId), shardId };
}

/**
 * Returns the number of shards.
 */
export function getNumShards(): number {
  return NUM_SHARDS;
}
