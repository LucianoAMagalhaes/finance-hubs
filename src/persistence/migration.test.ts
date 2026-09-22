import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import SQLite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Expense, Purchase, State } from "@/domain";
import { executeOnDatabase, loadState, openDatabase, type Database } from "@/persistence";

// The real database was created in Portuguese (migrations 0000 to 0006). These
// tests build one at that schema, the way drizzle did, and open it through the
// normal path, which applies the migration to English.

const MIGRATIONS = path.join(process.cwd(), "drizzle");
const LAST_PORTUGUESE_MIGRATION = 6;

let folder: string;
let file: string;
const opened: Database[] = [];

function open(): Database {
  const database = openDatabase(file);
  opened.push(database);
  return database;
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "finance-hubs-"));
  file = path.join(folder, "finance-hubs.db");
});

afterEach(() => {
  for (const database of opened.splice(0)) database.close();
  rmSync(folder, { recursive: true, force: true });
});

/** A database at the 0006 schema, with the rows of `fill` written in Portuguese. */
function portugueseDatabase(fill: (sqlite: SQLite.Database) => void): void {
  const oldMigrations = path.join(folder, "drizzle");
  mkdirSync(path.join(oldMigrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8"));
  journal.entries = journal.entries.slice(0, LAST_PORTUGUESE_MIGRATION + 1);
  writeFileSync(path.join(oldMigrations, "meta", "_journal.json"), JSON.stringify(journal));
  for (const { tag } of journal.entries) {
    copyFileSync(path.join(MIGRATIONS, `${tag}.sql`), path.join(oldMigrations, `${tag}.sql`));
  }

  const sqlite = new SQLite(file);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: oldMigrations });
    fill(sqlite);
  } finally {
    sqlite.close();
  }
}

function insert(sqlite: SQLite.Database, table: string, rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const columns = Object.keys(row);
    sqlite
      .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => `@${c}`).join(", ")})`)
      .run(row);
  }
}

describe("migration to English", () => {
  it("a database at the 0006 schema opens with the English ids and the same values, dates, installments, periods, prepayments and trash marks", () => {
    portugueseDatabase((sqlite) => {
      insert(sqlite, "orcamento_do_mes", [
        { mes: "2026-01", custos_fixos: 31, liberdade_financeira: 24, conforto: 16, metas: 14, conhecimento: 10, prazeres: 5 },
      ]);
      insert(sqlite, "entrada", [
        {
          id: 1,
          data: "2026-01-05",
          descricao: "Salário de janeiro",
          fonte: "salario",
          tipo_de_pagamento: "transferencia",
          valor: 720_050,
          apagado_em: null,
        },
      ]);
      insert(sqlite, "lancamento", [
        {
          id: 1,
          data: "2026-01-10",
          descricao: "conforto e metas",
          pote: "conforto",
          tipo_de_pagamento: "cartao-de-debito",
          valor: -4_550,
          parcelas: 1,
          tag: "conforto",
          apagado_em: null,
        },
        {
          id: 2,
          data: "2026-01-31",
          descricao: "Geladeira",
          pote: "custos-fixos",
          tipo_de_pagamento: "cartao-de-credito",
          valor: 389_900,
          parcelas: 10,
          tag: "saúde-mental",
          apagado_em: null,
        },
        {
          id: 4,
          data: "2026-01-20",
          descricao: "Curso de inglês",
          pote: "conhecimento",
          tipo_de_pagamento: "pix",
          valor: 30_000,
          parcelas: 1,
          tag: null,
          apagado_em: "2026-02-01",
        },
      ]);
      insert(sqlite, "antecipacao", [
        { id: 1, lancamento: 2, data: "2026-07-20", parcelas: 2, valor: 70_000, apagado_em: null },
        { id: 2, lancamento: 2, data: "2026-06-10", parcelas: 1, valor: 38_000, apagado_em: "2026-06-11" },
      ]);
      insert(sqlite, "recorrente", [{ id: 3, dia: 31, encerrado_em: "2026-12", apagado_em: null }]);
      insert(sqlite, "vigencia", [
        {
          recorrente: 3,
          desde: "2026-06",
          descricao: "Aluguel reajustado",
          pote: "metas",
          tipo_de_pagamento: "debito-automatico",
          valor: 155_000,
          tag: null,
        },
        {
          recorrente: 3,
          desde: "2026-01",
          descricao: "Aluguel",
          pote: "custos-fixos",
          tipo_de_pagamento: "boleto",
          valor: 150_000,
          tag: "moradia",
        },
      ]);
    });

    const expected: State = {
      budgets: {
        "2026-01": { "fixed-costs": 31, "financial-freedom": 24, comfort: 16, goals: 14, knowledge: 10, pleasures: 5 },
      },
      incomes: [
        {
          id: 1,
          date: "2026-01-05",
          description: "Salário de janeiro",
          source: "salary",
          paymentMethod: "transfer",
          amount: 720_050,
          deletedAt: null,
        },
      ],
      expenses: [
        purchase({
          id: 1,
          date: "2026-01-10",
          description: "conforto e metas",
          jar: "comfort",
          paymentMethod: "debit-card",
          amount: -4_550,
          installments: 1,
          tag: "conforto",
        }),
        purchase({
          id: 2,
          date: "2026-01-31",
          description: "Geladeira",
          jar: "fixed-costs",
          paymentMethod: "credit-card",
          amount: 389_900,
          installments: 10,
          tag: "saúde-mental",
          prepayments: [
            { id: 1, date: "2026-07-20", installments: 2, amount: 70_000, deletedAt: null },
            { id: 2, date: "2026-06-10", installments: 1, amount: 38_000, deletedAt: "2026-06-11" },
          ],
        }),
        {
          id: 3,
          kind: "recurring",
          day: 31,
          periods: [
            { since: "2026-01", description: "Aluguel", jar: "fixed-costs", paymentMethod: "boleto", amount: 150_000, tag: "moradia" },
            {
              since: "2026-06",
              description: "Aluguel reajustado",
              jar: "goals",
              paymentMethod: "direct-debit",
              amount: 155_000,
              tag: null,
            },
          ],
          endedIn: "2026-12",
          deletedAt: null,
        },
        purchase({
          id: 4,
          date: "2026-01-20",
          description: "Curso de inglês",
          jar: "knowledge",
          paymentMethod: "pix",
          amount: 30_000,
          installments: 1,
          tag: null,
          deletedAt: "2026-02-01",
        }),
      ],
    };

    expect(loadState(open())).toEqual(expected);
  });

  it("every stored id of jar, source and payment method is converted, even in the trash", () => {
    const jars = {
      "custos-fixos": "fixed-costs",
      "liberdade-financeira": "financial-freedom",
      conforto: "comfort",
      metas: "goals",
      conhecimento: "knowledge",
      prazeres: "pleasures",
    };
    const sources = { salario: "salary", freela: "freelance", rendimentos: "investment-returns", "outras-receitas": "other-income" };
    const methods = {
      dinheiro: "cash",
      "cartao-de-credito": "credit-card",
      "cartao-de-debito": "debit-card",
      pix: "pix",
      transferencia: "transfer",
      boleto: "boleto",
      "debito-automatico": "direct-debit",
    };
    const row = { data: "2026-01-10", descricao: "Compra", valor: 1_000 };

    portugueseDatabase((sqlite) => {
      insert(sqlite, "entrada", [
        ...Object.keys(sources).map((source, i) => ({ ...row, id: i + 1, fonte: source, tipo_de_pagamento: "pix", apagado_em: null })),
        ...Object.keys(methods).map((method, i) => ({ ...row, id: i + 11, fonte: "salario", tipo_de_pagamento: method, apagado_em: "2026-01-11" })),
      ]);
      insert(sqlite, "lancamento", [
        ...Object.keys(jars).map((jar, i) => ({ ...row, id: i + 1, pote: jar, tipo_de_pagamento: "pix", parcelas: 1, apagado_em: null })),
        ...Object.keys(methods).map((method, i) => ({ ...row, id: i + 11, pote: "metas", tipo_de_pagamento: method, parcelas: 1, apagado_em: "2026-01-11" })),
      ]);
      insert(sqlite, "recorrente", [{ id: 21, dia: 5, encerrado_em: null, apagado_em: "2026-01-11" }]);
      insert(sqlite, "vigencia", [
        ...Object.keys(jars).map((jar, i) => ({
          recorrente: 21,
          desde: `2026-0${i + 1}`,
          descricao: "Aluguel",
          pote: jar,
          tipo_de_pagamento: Object.keys(methods)[i],
          valor: 1_000,
        })),
        { recorrente: 21, desde: "2026-07", descricao: "Aluguel", pote: "prazeres", tipo_de_pagamento: "debito-automatico", valor: 1_000 },
      ]);
    });

    const { incomes, expenses } = loadState(open());
    const purchases = expenses.filter((e): e is Purchase => e.kind === "purchase");
    const periods = expenses.flatMap((e) => (e.kind === "recurring" ? e.periods : []));

    expect(incomes.slice(0, 4).map((i) => i.source)).toEqual(Object.values(sources));
    expect(incomes.slice(4).map((i) => i.paymentMethod)).toEqual(Object.values(methods));
    expect(purchases.slice(0, 6).map((p) => p.jar)).toEqual(Object.values(jars));
    expect(purchases.slice(6).map((p) => p.paymentMethod)).toEqual(Object.values(methods));
    expect(periods.map((p) => [p.jar, p.paymentMethod])).toEqual([
      ...Object.values(jars).map((jar, i) => [jar, Object.values(methods)[i]]),
      ["pleasures", "direct-debit"],
    ]);
  });

  it("the numbering shared between purchase and recurring expense continues where it was", () => {
    portugueseDatabase((sqlite) => {
      insert(sqlite, "lancamento", [
        { id: 1, data: "2026-01-10", descricao: "Compra", pote: "conforto", tipo_de_pagamento: "pix", valor: 1_000, parcelas: 1 },
      ]);
      insert(sqlite, "recorrente", [{ id: 2, dia: 5 }]);
      insert(sqlite, "vigencia", [
        { recorrente: 2, desde: "2026-01", descricao: "Aluguel", pote: "custos-fixos", tipo_de_pagamento: "boleto", valor: 1_000 },
      ]);
    });

    const result = executeOnDatabase(
      open(),
      [
        {
          type: "save-expense",
          expense: { date: "2026-01-12", description: "Livro", jar: "knowledge", paymentMethod: "pix", amount: 5_000, installments: 1 },
        },
      ],
      "2026-01-12",
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.value.expenses.map((e) => [e.id, e.kind])).toEqual([
      [1, "purchase"],
      [2, "recurring"],
      [3, "purchase"],
    ]);
    expect(loadState(open())).toEqual(result.value);
  });
});

function purchase(fields: Omit<Purchase, "kind" | "prepayments" | "deletedAt"> & Partial<Purchase>): Expense {
  return { kind: "purchase", prepayments: [], deletedAt: null, ...fields };
}
