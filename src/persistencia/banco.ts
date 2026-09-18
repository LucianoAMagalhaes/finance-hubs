import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as esquema from "./esquema";

export type Banco = {
  db: BetterSQLite3Database<typeof esquema>;
  fechar(): void;
};

const PASTA_DAS_MIGRATIONS = path.join(process.cwd(), "drizzle");

/** Abre o arquivo SQLite, criando-o (e a pasta) se não existir, e aplica as migrations pendentes. */
export function abrirBanco(arquivo: string): Banco {
  mkdirSync(path.dirname(arquivo), { recursive: true });
  const sqlite = new Database(arquivo);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema: esquema });
  migrate(db, { migrationsFolder: PASTA_DAS_MIGRATIONS });
  return { db, fechar: () => sqlite.close() };
}
