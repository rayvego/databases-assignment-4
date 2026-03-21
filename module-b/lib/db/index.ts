import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(path.join(process.cwd(), "sqlite.db"));
const db = drizzle(sqlite, { schema });

export { db, sqlite };
export * from "./schema";
