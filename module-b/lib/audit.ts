import fs from "fs";
import path from "path";
import { db, auditLog } from "@/lib/db";

const LOG_PATH = path.join(process.cwd(), "logs", "audit.log");

interface LogActionParams {
  tableName: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  recordId: number;
  performedBy: number;
  details?: object;
}

export function logAction({
  tableName,
  action,
  recordId,
  performedBy,
  details,
}: LogActionParams): void {
  // Write to database
  db.insert(auditLog)
    .values({
      tableName,
      action,
      recordId,
      performedBy,
      details: details ? JSON.stringify(details) : undefined,
    })
    .run();

  // Append to audit.log file
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    table: tableName,
    recordId,
    performedBy,
    details: details ?? null,
  });
  fs.appendFileSync(LOG_PATH, entry + "\n");
}
