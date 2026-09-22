import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import SQLite from "better-sqlite3";
import { openDatabase, type Database } from "@/persistence";

/** How many copies the backup directory keeps. Renaming a copy takes it out of this count, for good. */
const KEPT_COPIES = 5;

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
  if (existsSync(config.dbFile)) {
    const copy = copyDatabase(config, now);
    try {
      pruneCopies(config, copy);
    } catch (error) {
      // Failing to delete old copies puts no data at risk, so the app still starts.
      console.warn(`finance-hubs: could not clean up the old copies in ${config.backupDir}.`, error);
    }
  }
  return openDatabase(config.dbFile);
}

function copyDatabase({ dbFile, backupDir }: Config, now: Date): string {
  mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `${copyPrefix(dbFile)}${timestamp(now)}.db`);
  const source = new SQLite(dbFile, { readonly: true });
  try {
    // VACUUM INTO gives a consistent copy, including whatever is still in the WAL.
    source.prepare("VACUUM INTO ?").run(file);
  } finally {
    source.close();
  }
  return file;
}

/**
 * Discards the copy just taken when the database hasn't changed since the previous one, so that the
 * directory only grows when the data does, and keeps the `KEPT_COPIES` most recent ones.
 */
function pruneCopies(config: Config, justCopied: string): void {
  const previous = copiesOf(config).filter((file) => file !== justCopied);
  const latest = previous.at(-1);
  if (latest !== undefined && sameContents(latest, justCopied)) {
    rmSync(justCopied);
    return;
  }
  const kept = [...previous, justCopied];
  for (const old of kept.slice(0, Math.max(0, kept.length - KEPT_COPIES))) rmSync(old);
}

/**
 * The copies this app took, oldest first, recognised by their name. Any other file in the directory
 * — a copy renamed by hand, say — is left alone.
 */
function copiesOf({ dbFile, backupDir }: Config): string[] {
  const prefix = copyPrefix(dbFile);
  return readdirSync(backupDir)
    .filter((name) => name.startsWith(prefix) && TIMESTAMPED.test(name.slice(prefix.length)))
    .sort() // The timestamp in the name sorts chronologically.
    .map((name) => path.join(backupDir, name));
}

const TIMESTAMPED = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/;

const copyPrefix = (dbFile: string): string => `${path.basename(dbFile, path.extname(dbFile))}-`;

const sameContents = (a: string, b: string): boolean => digestOf(a) === digestOf(b);

const digestOf = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

/** "2026-09-18_07-05-09", in local time. */
function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
