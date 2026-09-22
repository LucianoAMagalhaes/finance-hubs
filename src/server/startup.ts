import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import SQLite from "better-sqlite3";
import { openDatabase, type Database } from "@/persistence";

export type Config = {
  dbFile: string;
  /** Where each startup leaves a copy of the database. */
  backupDir: string;
};

/** `FH_DB_FILE` and `FH_BACKUP_DIR`; without the latter, the copies go to `backups/` next to the database. */
export function configFromEnv(env: Record<string, string | undefined> = process.env): Config {
  // turbopackIgnore: these are runtime data paths, not app files to bundle.
  const dbFile = path.resolve(/*turbopackIgnore: true*/ env.FH_DB_FILE ?? path.join("data", "finance-hubs.db"));
  const backupDir = path.resolve(
    /*turbopackIgnore: true*/ env.FH_BACKUP_DIR ?? path.join(path.dirname(dbFile), "backups"),
  );
  return { dbFile, backupDir };
}

/**
 * Brings up the app's persistence: copies the existing database to the backup
 * directory, then opens it (creating it if needed) and applies the migrations.
 * The copy comes before the migrations to keep the database as it was.
 */
export function startUp(config: Config, now: Date = new Date()): Database {
  if (existsSync(config.dbFile)) copyDatabase(config, now);
  return openDatabase(config.dbFile);
}

function copyDatabase({ dbFile, backupDir }: Config, now: Date): void {
  mkdirSync(backupDir, { recursive: true });
  const name = `${path.basename(dbFile, path.extname(dbFile))}-${timestamp(now)}.db`;
  const source = new SQLite(dbFile, { readonly: true });
  try {
    // VACUUM INTO gives a consistent copy, including whatever is still in the WAL.
    source.prepare("VACUUM INTO ?").run(path.join(backupDir, name));
  } finally {
    source.close();
  }
}

/** "2026-09-18_07-05-09", in local time. */
function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
