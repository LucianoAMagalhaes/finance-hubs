import { mkdirSync } from "node:fs";
import path from "node:path";
import SQLite, { type RunResult } from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Database = {
  db: BetterSQLite3Database<typeof schema>;
  close(): void;
};

/** The open database or a transaction of it: whoever reads and writes doesn't need to know which. */
export type Connection = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Opens the SQLite file, creating it (and the folder) if it doesn't exist, and applies the pending migrations. */
export function openDatabase(file: string): Database {
  mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new SQLite(file);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => sqlite.close() };
}
