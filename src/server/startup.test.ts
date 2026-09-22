import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import SQLite from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyState, JARS, type Percentages } from "@/domain";
import { openDatabase, loadState, executeOnDatabase } from "@/persistence";
import { configFromEnv, startUp } from "./startup";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "finance-hubs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const september = Object.fromEntries(JARS.map((j) => [j.id, 10])) as Percentages;

describe("startup", () => {
  it("creates the database if it does not exist and applies the migrations", () => {
    const dbFile = path.join(dir, "data", "finance-hubs.db");

    const db = startUp({ dbFile, backupDir: path.join(dir, "backups") });

    expect(existsSync(dbFile)).toBe(true);
    expect(loadState(db)).toEqual(emptyState());
    db.close();
  });

  it("copies the existing database to the configured directory, with date and time in the name", () => {
    const dbFile = path.join(dir, "data", "finance-hubs.db");
    const backupDir = path.join(dir, "copies");
    const previous = openDatabase(dbFile);
    const prepared = executeOnDatabase(previous, [{ type: "save-percentages", month: "2026-09", percentages: september }], "2026-09-18");
    expect(prepared.ok).toBe(true);
    previous.close();

    const db = startUp({ dbFile, backupDir }, new Date(2026, 8, 18, 7, 5, 9));
    db.close();

    expect(readdirSync(backupDir)).toEqual(["finance-hubs-2026-09-18_07-05-09.db"]);
    const copy = openDatabase(path.join(backupDir, "finance-hubs-2026-09-18_07-05-09.db"));
    expect(loadState(copy).budgets["2026-09"]).toEqual(september);
    copy.close();
  });

  it("copies the database as it was, before the migrations run", () => {
    const dbFile = path.join(dir, "finance-hubs.db");
    const backupDir = path.join(dir, "backups");
    const unmigrated = new SQLite(dbFile);
    unmigrated.exec("CREATE TABLE marker (x INTEGER)");
    unmigrated.close();

    startUp({ dbFile, backupDir }, new Date(2026, 8, 18, 7, 5, 9)).close();

    const copy = new SQLite(path.join(backupDir, "finance-hubs-2026-09-18_07-05-09.db"), { readonly: true });
    const tables = copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    copy.close();
    expect(tables).toEqual(["marker"]);
  });

  it("on the first startup, with no database yet, there is nothing to copy", () => {
    const backupDir = path.join(dir, "backups");

    startUp({ dbFile: path.join(dir, "finance-hubs.db"), backupDir }).close();

    expect(existsSync(backupDir) ? readdirSync(backupDir) : []).toEqual([]);
  });

  it("reads FH_DB_FILE and FH_BACKUP_DIR; without the latter, the copies go next to the database", () => {
    expect(configFromEnv({ FH_DB_FILE: "/srv/fh/data.db" })).toEqual({
      dbFile: "/srv/fh/data.db",
      backupDir: "/srv/fh/backups",
    });
    expect(configFromEnv({ FH_DB_FILE: "/srv/fh/data.db", FH_BACKUP_DIR: "/mnt/cloud" })).toEqual({
      dbFile: "/srv/fh/data.db",
      backupDir: "/mnt/cloud",
    });
  });

  it("without any variable, the database is data/finance-hubs.db with the backups next to it", () => {
    expect(configFromEnv({})).toEqual({
      dbFile: path.resolve("data", "finance-hubs.db"),
      backupDir: path.resolve("data", "backups"),
    });
  });
});
