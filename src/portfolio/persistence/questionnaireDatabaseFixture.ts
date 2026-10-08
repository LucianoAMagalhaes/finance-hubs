import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import SQLite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach } from "vitest";
import { openDatabase, type Database } from "@/persistence";
import * as schema from "@/persistence/schema";
import type { IsoDate, PortfolioCommand } from "@/portfolio/domain";
import { executePortfolioOnDatabase, loadPortfolio } from "@/portfolio/persistence";

/** Creates historical SQLite fixtures; observations use the normal portfolio interfaces. */
export function questionnaireDatabaseFixture(lastMigration: number, today: IsoDate) {
  let folder: string;
  let file: string;
  const opened: Database[] = [];
  const close = () => {
    for (const database of opened.splice(0)) database.close();
  };
  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), "portfolio-questionnaires-"));
    file = path.join(folder, "portfolio.db");
  });
  afterEach(() => {
    close();
    rmSync(folder, { recursive: true, force: true });
  });
  return {
    get file() { return file; },
    close,
    open() {
      const database = openDatabase(file);
      opened.push(database);
      return database;
    },
    execute(database: Database, ...commands: PortfolioCommand[]) {
      for (const command of commands) {
        const result = executePortfolioOnDatabase(database, command, today);
        if (!result.ok) throw new Error(result.error);
      }
      return loadPortfolio(database);
    },
    legacy(fill: (database: Database) => void, version = lastMigration) {
      const migrations = path.join(folder, "migrations");
      mkdirSync(path.join(migrations, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= version);
      writeFileSync(path.join(migrations, "meta/_journal.json"), JSON.stringify(journal));
      for (const { tag } of journal.entries) copyFileSync(`drizzle/${tag}.sql`, path.join(migrations, `${tag}.sql`));
      const sqlite = new SQLite(file);
      try {
        const db = drizzle(sqlite, { schema });
        migrate(db, { migrationsFolder: migrations });
        fill({ db, close: () => sqlite.close() });
      } finally { sqlite.close(); }
    },
  };
}
