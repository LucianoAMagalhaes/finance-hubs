import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import SQLite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOnDatabase, loadState, openDatabase, type Database } from "@/persistence";
import {
  ASSET_CLASSES,
  decimal,
  DEFAULT_TARGETS,
  emptyPortfolio,
  projectPortfolio,
  type IsoDate,
  type PortfolioCommand,
  type PortfolioState,
  type Targets,
  type UnitTrade,
} from "@/portfolio/domain";
import { executePortfolioOnDatabase, loadPortfolio } from "@/portfolio/persistence";

const TODAY = "2026-09-25";

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
  file = path.join(folder, "data", "finance-hubs.db");
});

afterEach(() => {
  for (const database of opened.splice(0)) database.close();
  rmSync(folder, { recursive: true, force: true });
});

describe("the portfolio's persistence", () => {
  it.each([18, 19])("migrates an existing portfolio at migration %s without changing holdings, sources, values or the budget", (lastMigration) => {
    const migrations = path.join(folder, "old-migrations");
    mkdirSync(path.join(migrations, "meta"), { recursive: true });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= lastMigration);
    writeFileSync(path.join(migrations, "meta/_journal.json"), JSON.stringify(journal));
    for (const { tag } of journal.entries) copyFileSync(`drizzle/${tag}.sql`, path.join(migrations, `${tag}.sql`));
    mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = new SQLite(file);
    try {
      migrate(drizzle(sqlite), { migrationsFolder: migrations });
      sqlite.exec(`
        INSERT INTO income (id, date, description, source, payment_method, amount) VALUES (1, '2026-09-25', 'Salário', 'salary', 'pix', 500000);
        INSERT INTO asset (id, ticker, asset_class, source_id) VALUES (1, 'BTC', 'crypto', 'bitcoin'), (2, 'PETR4', 'domestic-stocks', 'BRPETRACNPR6');
        INSERT INTO trade (id, asset, kind, date, quantity, unit_price) VALUES (1, 1, 'buy', '2026-09-01', 200000000, 10000000000);
        INSERT INTO payout_origin (id, asset, kind, record_date, payment_date) VALUES (1, 1, 'interest', '2026-09-01', '2026-09-02');
        INSERT INTO payout (id, asset, date, kind, amount, origin) VALUES (1, 1, '2026-09-02', 'interest', 500, 1);
        INSERT INTO quote (asset, price, at) VALUES (1, 12000000000, '2026-09-25T12:00:00');
        INSERT INTO current_exchange_rate (id, rate, at) VALUES (1, 50000, '2026-09-25T12:00:00');
        INSERT INTO last_fetch (kind, at) VALUES ('quotes', '2026-09-25T12:00:00');
        INSERT INTO rate_index (kind, date, rate) VALUES ('cdi', '2026-09-24', 5500000);
        UPDATE class_target SET target = CASE asset_class WHEN 'crypto' THEN 100 ELSE 0 END;
      `);
      if (lastMigration === 19) sqlite.exec("INSERT INTO manual_score (asset, score, evaluated_at) VALUES (1, 10, '2026-09-24');");
    } finally { sqlite.close(); }
    const database = open();
    const originalBudget = loadState(database);
    expect(originalBudget.incomes).toEqual([expect.objectContaining({ description: "Salário", amount: 500000 })]);
    const before = loadPortfolio(database);
    expect(before).toMatchObject({
      assets: [{ id: 1, ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" }, { id: 2, ticker: "PETR4", assetClass: "domestic-stocks" }],
      trades: [{ id: 1, quantity: decimal(2), unitPrice: decimal(100) }],
      payouts: [{ id: 1, amount: 500, origin: 1 }],
      payoutOrigins: [{ id: 1, recordDate: "2026-09-01", paymentDate: "2026-09-02" }],
      quotes: [{ asset: 1, price: decimal(120), at: "2026-09-25T12:00:00" }],
      exchangeRate: { rate: 50000, at: "2026-09-25T12:00:00" },
      rateIndexes: [{ kind: "cdi", date: "2026-09-24", rate: decimal(0.055) }],
      lastFetch: { quotes: "2026-09-25T12:00:00" },
      scores: lastMigration === 19 ? [{ asset: 1, score: 10, evaluatedAt: "2026-09-24" }] : [], targets: { crypto: 100 },
      questionnaires: emptyPortfolio().questionnaires, answers: [], questionnaireEvaluations: [],
    });
    expect(projectPortfolio(before, TODAY)).toMatchObject({ currentValue: 24000, totalGain: 4500 });
    expect(projectPortfolio(before, TODAY).classes[0]?.assets[0]).toMatchObject({ score: null, evaluatedAt: null });
    executeOk(database, { type: "save-score", asset: 1, score: 0 });
    const after = loadPortfolio(open());
    expect(after).toEqual({ ...before, scores: [{ asset: 1, score: 0, evaluatedAt: TODAY }] });
    expect(projectPortfolio(after, TODAY)).toMatchObject({ currentValue: 24000, totalGain: 4500 });
    expect(loadState(open())).toEqual(originalBudget);
  });

  it("keeps only the current score and date after reopening and deletes the evaluation with an unused asset", () => {
    const database = open();
    const budget = loadState(database);
    executeOk(database, { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" } });
    executeOk(database, { type: "save-score", asset: 1, score: 0 });
    expect(projectPortfolio(loadPortfolio(open()), TODAY).classes.find(c => c.key === "crypto")!.assets[0]).toMatchObject({ score: 0, evaluatedAt: TODAY });
    const corrected = executePortfolioOnDatabase(database, { type: "save-score", asset: 1, score: 10 }, "2026-09-26");
    expect(corrected.ok).toBe(true);
    expect(loadPortfolio(open()).scores).toEqual([{ asset: 1, score: 10, evaluatedAt: "2026-09-26" }]);
    expect(executePortfolioOnDatabase(database, { type: "save-score", asset: 1, score: 11 }, TODAY).ok).toBe(false);
    expect(loadPortfolio(open()).scores).toEqual([{ asset: 1, score: 10, evaluatedAt: "2026-09-26" }]);
    executeOk(database, { type: "delete-asset", id: 1 });
    expect(loadPortfolio(open()).scores).toEqual([]);
    executeOk(database, { type: "save-asset", asset: { ticker: "ETH", assetClass: "crypto" } });
    expect(projectPortfolio(loadPortfolio(open()), TODAY).classes.find(c => c.key === "crypto")!.assets[0]?.score).toBeNull();
    expect(loadState(open())).toEqual(budget);
  });
  it("reloads a Treasury bond with its fractional trades, interest and last quote without changing its market valuation", () => {
    const database = open();
    executeOk(database,
      { type: "save-asset", asset: { ticker: "Tesouro IPCA+ 2035", assetClass: "fixed-income", sourceId: "ipca-plus|2035-05-15",
        bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-01-02", quantity: decimal(0.37), unitPrice: decimal(2000) } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-02-02", quantity: decimal(0.13), unitPrice: decimal(3000) } },
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-03-02", quantity: decimal(0.2), unitPrice: decimal(2400) } },
      { type: "save-payout", payout: { asset: 1, kind: "interest", date: "2026-05-15", amount: 1_234 } },
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(2500), at: "2026-09-25T14:32:00" }] },
      { type: "record-fetch", kind: "quotes", at: "2026-09-25T14:32:00" },
    );
    const reloaded = loadPortfolio(open());
    expect(reloaded.assets).toEqual([{ id: 1, ticker: "Tesouro IPCA+ 2035", assetClass: "fixed-income", sourceId: "ipca-plus|2035-05-15",
      bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } }]);
    expect(reloaded.trades).toEqual([
      { id: 1, asset: 1, kind: "buy", date: "2026-01-02", quantity: decimal(0.37), unitPrice: decimal(2000), exchangeRate: null },
      { id: 2, asset: 1, kind: "buy", date: "2026-02-02", quantity: decimal(0.13), unitPrice: decimal(3000), exchangeRate: null },
      { id: 3, asset: 1, kind: "sell", date: "2026-03-02", quantity: decimal(0.2), unitPrice: decimal(2400), exchangeRate: null },
    ]);
    expect(reloaded.payouts).toEqual([{ id: 1, asset: 1, kind: "interest", date: "2026-05-15", amount: 1_234 }]);
    expect(reloaded.quotes).toEqual([{ asset: 1, price: decimal(2500), at: "2026-09-25T14:32:00" }]);
    expect(reloaded.lastFetch).toEqual({ quotes: "2026-09-25T14:32:00" });
    const view = projectPortfolio(reloaded, TODAY);
    const bond = view.classes.find((c) => c.key === "fixed-income")!.assets[0]!;
    expect(bond.quantity).toBe(decimal(0.3));
    expect(bond.averagePrice).toBeCloseTo(226_000, 6);
    expect(bond.cost).toBeCloseTo(67_800, 6);
    expect(bond.currentValue).toBe(75_000);
    expect(bond.totalGain).toBeCloseTo(11_234, 6);
    expect(view.totalGain).toBeCloseTo(11_234, 6);
  });

  it("keeps a reloaded Treasury bond matured, refuses new buys and persists the final sale and lifetime gain", () => {
    const database = open();
    const before = executeOk(database,
      { type: "save-asset", asset: { ticker: "Tesouro IPCA+ 2026", assetClass: "fixed-income", sourceId: "ipca-plus|2026-05-04",
        bond: { kind: "treasury-bond", maturityDate: "2026-05-04" } } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-01-02", quantity: decimal(0.5), unitPrice: decimal(2000) } },
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(2200), at: "2026-04-30T12:00:00" }] },
    );
    const reopened = open();
    const reloaded = loadPortfolio(reopened);
    expect(reloaded).toEqual(before);
    const fixedIncome = projectPortfolio(reloaded, TODAY).classes.find((c) => c.key === "fixed-income")!;
    expect(fixedIncome.assets[0]).toMatchObject({
      currentValue: 110_000, quote: 220_000, quoteAt: "2026-04-30T12:00:00", tags: ["matured", "no-score"],
    });
    expect(executePortfolioOnDatabase(reopened, { type: "save-trade", trade: {
      asset: 1, kind: "buy", date: "2026-05-04", quantity: decimal(0.1), unitPrice: decimal(2000),
    } }, TODAY)).toEqual({ ok: false, error: "Não é possível comprar ou aplicar no vencimento de 04/05/2026 ou depois dele." });
    expect(loadPortfolio(open())).toEqual(before);
    executeOk(reopened, { type: "save-trade", trade: {
      asset: 1, kind: "sell", date: TODAY, quantity: decimal(0.5), unitPrice: decimal(2300),
    } });
    const sold = loadPortfolio(open());
    expect(sold.quotes).toEqual(before.quotes);
    expect(sold.trades[1]).toMatchObject({ kind: "sell", date: TODAY, quantity: decimal(0.5), unitPrice: decimal(2300) });
    expect(projectPortfolio(sold, TODAY).classes.find((c) => c.key === "fixed-income")!.assets[0]).toMatchObject({
      quantity: 0, cost: 0, currentValue: 0, totalGain: 15_000, tags: ["matured", "zero-position", "no-score"],
    });
  });

  it("keeps monthly projections across reopening and removes them when official IPCA arrives", () => {
    const database = open();
    const projected = executeOk(database, { type: "record-rate-indexes", rateIndexes: [
      { kind: "ipca-projection", date: "2026-08-01", rate: decimal(0.6) },
      { kind: "ipca-projection", date: "2026-09-01", rate: decimal(0.56) },
    ] });
    expect(loadPortfolio(open())).toEqual(projected);
    const official = executeOk(database, { type: "record-rate-indexes", rateIndexes: [
      { kind: "ipca", date: "2026-08-01", rate: decimal(-0.32) },
    ] });
    expect(loadPortfolio(open())).toEqual(official);
    expect(official.rateIndexes).toEqual([
      { kind: "ipca", date: "2026-08-01", rate: decimal(-0.32) },
      { kind: "ipca-projection", date: "2026-09-01", rate: decimal(0.56) },
    ]);
  });
  it("keeps exact daily indexes and their last fetch across reopening, replacing a repeated date", () => {
    const database = open();
    executeOk(database, { type: "record-rate-indexes", rateIndexes: [
      { kind: "cdi", date: "2026-09-23", rate: decimal(0.055131) },
      { kind: "cdi", date: "2026-09-24", rate: decimal(0.055131) },
    ] });
    executeOk(database, { type: "record-rate-indexes", rateIndexes: [
      { kind: "cdi", date: "2026-09-23", rate: decimal(0.054) },
    ] });
    const state = executeOk(database, { type: "record-fetch", kind: "rate-indexes", at: "2026-09-25T14:32:00" });
    expect(loadPortfolio(open())).toEqual(state);
    expect(state).toMatchObject({ rateIndexes: [
      { kind: "cdi", date: "2026-09-23", rate: decimal(0.054) },
      { kind: "cdi", date: "2026-09-24", rate: decimal(0.055131) },
    ], lastFetch: { "rate-indexes": "2026-09-25T14:32:00" } });
  });
  it("a new database opens the portfolio with the default targets", () => {
    expect(loadPortfolio(open())).toEqual(emptyPortfolio());
    expect(loadPortfolio(open()).targets).toEqual(DEFAULT_TARGETS);
  });

  it("the saved targets come back identical from the database, and the dashboard with them", () => {
    const state = executeOk(open(), saveTargets(targets(30, 20, 40, 10, 0)));

    const reloaded = loadPortfolio(open());

    expect(reloaded).toEqual(state);
    expect(reloaded.targets).toEqual(targets(30, 20, 40, 10, 0));
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("saving the targets again rewrites them, keeping no previous one", () => {
    const database = open();
    executeOk(database, saveTargets(targets(30, 20, 40, 10, 0)));

    const after = executeOk(database, saveTargets(targets(0, 0, 100, 0, 0)));

    expect(loadPortfolio(open())).toEqual(after);
    expect(after.targets).toEqual(targets(0, 0, 100, 0, 0));
  });

  it("a refused command returns the domain's text and leaves the database as it was", () => {
    const database = open();
    const before = executeOk(database, saveTargets(targets(30, 20, 40, 10, 0)));

    const result = executePortfolioOnDatabase(database, saveTargets(targets(30, 20, 40, 10, 5)), TODAY);

    expect(result).toEqual({ ok: false, error: "Os alvos somam 105%: passam de 100 em 5 pontos." });
    expect(loadPortfolio(open())).toEqual(before);
  });

  it("assets and trades come back identical from the database, and the dashboard with them", () => {
    const database = open();
    const state = executeOk(
      database,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" } },
      { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" } },
      { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(100), unitPrice: decimal(36.8) } },
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-01-02", quantity: 321000, unitPrice: 12345 } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-02-10", quantity: decimal(0.5), unitPrice: decimal(612000) } },
    );

    const reloaded = loadPortfolio(open());

    expect(reloaded).toEqual(state);
    expect(reloaded.assets.map((a) => a.ticker)).toEqual(["PETR4", "BTC", "HGLG11"]);
    expect(reloaded.trades).toHaveLength(3);
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("a private bond and its applications in reais come back identical, and the dashboard with them", () => {
    const database = open();
    const bond = { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12.5), maturityDate: "2028-01-02" } as const;
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "CDB Inter 2028", assetClass: "fixed-income", bond } },
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-01-02", amount: 1_000_000 } },
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-03-10", quantity: decimal(100), unitPrice: decimal(36.8) } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-05-04", amount: 500_000 } },
    );
    const state = executeOk(
      database,
      {
        type: "save-asset",
        asset: { id: 1, ticker: "CDB Inter 2028", assetClass: "fixed-income", bond: { ...bond, bondType: "lci", rate: decimal(11.75) } },
      },
      { type: "save-trade", trade: { id: 3, asset: 1, kind: "buy", date: "2026-05-05", amount: 450_050 } },
    );

    const reloaded = loadPortfolio(open());

    expect(reloaded).toEqual(state);
    expect(reloaded.assets).toEqual([
      {
        id: 1,
        ticker: "CDB Inter 2028",
        assetClass: "fixed-income",
        sourceId: null,
        bond: { ...bond, bondType: "lci", rate: decimal(11.75) },
      },
      { id: 2, ticker: "PETR4", assetClass: "domestic-stocks", sourceId: null },
    ]);
    expect(reloaded.trades.filter((t) => t.asset === 1)).toEqual([
      { id: 1, asset: 1, kind: "buy", date: "2026-01-02", amount: 1_000_000 },
      { id: 3, asset: 1, kind: "buy", date: "2026-05-05", amount: 450_050 },
    ]);
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("persists partial and total redemptions, corrections and deletions without storing derived shares", () => {
    const database = open();
    const bond = { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12.5), maturityDate: "2028-01-02" } as const;
    const state = executeOk(
      database,
      { type: "save-asset", asset: { ticker: "CDB Inter 2028", assetClass: "fixed-income", bond } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-01-02", amount: 1_000_000 } },
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-05-04", amount: 500_000 } },
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: TODAY, amount: 600_000, redeemsAll: true } },
    );
    const reloaded = loadPortfolio(open());
    expect(reloaded).toEqual(state);
    expect(reloaded.trades[2]).toEqual({ id: 3, asset: 1, kind: "sell", date: TODAY, amount: 600_000, redeemsAll: true });
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
    expect(projectPortfolio(reloaded, TODAY).totalGain).toBeCloseTo(100_000, 6);

    const before = loadPortfolio(database);
    expect(executePortfolioOnDatabase(database, { type: "delete-trade", id: 1 }, TODAY).ok).toBe(false);
    expect(loadPortfolio(open())).toEqual(before);
    expect(executePortfolioOnDatabase(database, {
      type: "save-asset", asset: { id: 1, ticker: "CDB Inter 2028", assetClass: "fixed-income", bond: { ...bond, rate: decimal(1) } },
    }, TODAY).ok).toBe(true);
    // A total redemption adapts to the shares on its date; the partial still has coverage.
    const corrected = executeOk(database,
      { type: "save-trade", trade: { id: 3, asset: 1, kind: "sell", date: TODAY, amount: 100_000 } },
    );
    expect(loadPortfolio(open())).toEqual(corrected);
    expect(loadPortfolio(open()).trades[2]).not.toHaveProperty("redeemsAll");
    const deleted = executeOk(database, { type: "delete-trade", id: 2 }, { type: "delete-trade", id: 3 });
    expect(loadPortfolio(open())).toEqual(deleted);
    expect(deleted.trades).toEqual([before.trades[0]]);
  });

  it("a corrected ticker and source's id are rewritten, keeping the asset and its trades", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "ELET3", assetClass: "domestic-stocks" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(10), unitPrice: decimal(40) } },
    );

    const corrected = executeOk(database, {
      type: "save-asset",
      asset: { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: "BRAXIAACNOR1" },
    });

    expect(loadPortfolio(open())).toEqual(corrected);
    expect(corrected.assets).toEqual([{ id: 1, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: "BRAXIAACNOR1" }]);
  });

  it("a sale, a corrected trade and the deletions come back from the database as the domain left them", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "VALE3", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(100), unitPrice: decimal(30) } },
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-04-10", quantity: decimal(40), unitPrice: decimal(35) } },
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-04-10", quantity: decimal(5), unitPrice: decimal(60) } },
    );

    const state = executeOk(
      database,
      { type: "save-trade", trade: { id: 2, asset: 1, kind: "sell", date: "2026-04-11", quantity: decimal(50), unitPrice: decimal(36) } },
      { type: "delete-trade", id: 3 },
      { type: "delete-asset", id: 3 },
    );

    expect(loadPortfolio(open())).toEqual(state);
    expect(state.assets.map((a) => a.ticker)).toEqual(["PETR4", "VALE3"]);
    expect(state.trades.map((t) => [t.id, t.kind, t.date])).toEqual([
      [1, "buy", "2026-03-10"],
      [2, "sell", "2026-04-11"],
    ]);
  });

  it("payouts come back identical from the database, corrected and deleted as the domain left them", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "ITSA4", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(100), unitPrice: decimal(10) } },
      { type: "save-payout", payout: { asset: 1, date: "2026-05-20", kind: "interest-on-equity", amount: 5_412 } },
      { type: "save-payout", payout: { asset: 2, date: "2026-06-15", kind: "fund-income", amount: 1_100 } },
      { type: "save-payout", payout: { asset: 1, date: "2026-08-20", kind: "dividend", amount: 3_000 } },
    );

    const state = executeOk(
      database,
      { type: "save-payout", payout: { id: 2, asset: 2, date: "2026-06-16", kind: "fund-income", amount: 1_150 } },
      { type: "delete-payout", id: 3 },
    );

    const reloaded = loadPortfolio(open());
    expect(reloaded).toEqual(state);
    expect(reloaded.payouts).toEqual([
      { id: 1, asset: 1, date: "2026-05-20", kind: "interest-on-equity", amount: 5_412 },
      { id: 2, asset: 2, date: "2026-06-16", kind: "fund-income", amount: 1_150 },
    ]);
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("payouts from the source and their seen origins come back identical, and a deleted one stays seen", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds", sourceId: "BRHGLGCTF004" } },
      { type: "save-asset", asset: { ticker: "KNRI11", assetClass: "real-estate-funds", sourceId: "BRKNRICTF007" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-07-01", quantity: decimal(100), unitPrice: decimal(150) } },
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-07-01", quantity: decimal(10), unitPrice: decimal(140) } },
      {
        type: "record-source-payouts",
        payouts: [
          { asset: 1, kind: "fund-income", recordDate: "2026-07-31", paymentDate: "2026-08-14", perUnit: decimal(1.17) },
          { asset: 1, kind: "fund-income", recordDate: "2026-08-31", paymentDate: "2026-09-15", perUnit: decimal(1.17) },
          { asset: 2, kind: "fund-income", recordDate: "2026-08-31", paymentDate: "2026-09-15", perUnit: decimal(1) },
        ],
      },
      { type: "save-payout", payout: { asset: 1, date: "2026-09-20", kind: "fund-income", amount: 500 } },
    );

    const state = executeOk(
      database,
      { type: "save-payout", payout: { id: 1, asset: 1, date: "2026-08-14", kind: "fund-income", amount: 11_000 } },
      { type: "delete-payout", id: 2 },
      { type: "delete-payout", id: 3 },
      { type: "delete-trade", id: 2 },
      { type: "delete-asset", id: 2 },
      { type: "record-fetch", kind: "payouts", at: "2026-09-25T14:32:07" },
    );

    const reloaded = loadPortfolio(open());
    expect(reloaded).toEqual(state);
    expect(reloaded.payouts.map((p) => [p.id, p.amount])).toEqual([
      [1, 11_000],
      [4, 500],
    ]);
    expect(reloaded.lastFetch).toEqual({ payouts: "2026-09-25T14:32:07" });
    // The deleted payout's origin is still seen: the source doesn't bring it back.
    const again = executeOk(database, {
      type: "record-source-payouts",
      payouts: [{ asset: 1, kind: "fund-income", recordDate: "2026-08-31", paymentDate: "2026-09-15", perUnit: decimal(1.17) }],
    });
    expect(again.payouts).toHaveLength(2);
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("corporate actions come back identical from the database, corrected and deleted as the domain left them", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
      { type: "save-asset", asset: { ticker: "MGLU3", assetClass: "domestic-stocks" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-01-10", quantity: decimal(100), unitPrice: decimal(30) } },
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-01-10", quantity: decimal(10), unitPrice: decimal(200), exchangeRate: 50000 } },
      { type: "save-corporate-action", action: { asset: 1, kind: "split", date: "2026-03-10", ratio: { from: 1, to: 4 } } },
      { type: "save-corporate-action", action: { asset: 2, kind: "bonus", date: "2026-04-10", ratio: { from: 10, to: 11 } } },
      { type: "save-corporate-action", action: { asset: 3, kind: "reverse-split", date: "2026-05-10", ratio: { from: 10, to: 1 } } },
    );

    const state = executeOk(
      database,
      { type: "save-corporate-action", action: { id: 1, asset: 1, kind: "split", date: "2026-03-11", ratio: { from: 1, to: 5 } } },
      { type: "delete-corporate-action", id: 2 },
      { type: "delete-asset", id: 3 },
    );

    const reloaded = loadPortfolio(open());
    expect(reloaded).toEqual(state);
    expect(reloaded.corporateActions).toEqual([{ id: 1, asset: 1, kind: "split", date: "2026-03-11", ratio: { from: 1, to: 5 }, status: "confirmed" }]);
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("corporate actions from the source come back pending, confirmed and dismissed, with their origin", () => {
    const database = open();
    const proposed = (date: IsoDate, from: number, to: number) => ({ asset: 1, kind: "split" as const, date, ratio: { from, to } });
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-01-10", quantity: decimal(100), unitPrice: decimal(30) } },
      { type: "record-source-corporate-actions", actions: [proposed("2026-03-10", 1, 2), proposed("2026-05-10", 1, 3), proposed("2026-07-10", 10, 1)] },
    );

    const state = executeOk(
      database,
      { type: "confirm-corporate-action", id: 1 },
      { type: "dismiss-corporate-action", id: 3 },
      { type: "record-fetch", kind: "corporate-actions", at: "2026-09-25T14:32:07" },
    );

    const reloaded = loadPortfolio(open());
    expect(reloaded).toEqual(state);
    expect(reloaded.corporateActions.map((c) => [c.id, c.status, c.origin])).toEqual([
      [1, "confirmed", "2026-03-10 1:2"],
      [2, "pending", "2026-05-10 1:3"],
      [3, "dismissed", "2026-07-10 10:1"],
    ]);
    expect(reloaded.lastFetch).toEqual({ "corporate-actions": "2026-09-25T14:32:07" });
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("quotes and the time of the last fetch come back identical from the database", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "SHIB", assetClass: "crypto" } },
      { type: "save-asset", asset: { ticker: "VALE3", assetClass: "domestic-stocks" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(100), unitPrice: decimal(30) } },
      {
        type: "record-quotes",
        quotes: [
          { asset: 1, price: decimal(36.8), at: "2026-09-25T10:00:00" },
          { asset: 2, price: 12345, at: "2026-09-25T10:00:00" },
          { asset: 3, price: decimal(60), at: "2026-09-25T10:00:00" },
        ],
      },
    );

    const state = executeOk(
      database,
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(38.5), at: "2026-09-25T14:32:07" }] },
      { type: "record-fetch", kind: "quotes", at: "2026-09-25T14:32:07" },
      { type: "delete-asset", id: 3 },
    );

    const reloaded = loadPortfolio(open());
    expect(reloaded).toEqual(state);
    expect(reloaded.quotes).toEqual([
      { asset: 1, price: decimal(38.5), at: "2026-09-25T14:32:07" },
      { asset: 2, price: 12345, at: "2026-09-25T10:00:00" },
    ]);
    expect(reloaded.lastFetch).toEqual({ quotes: "2026-09-25T14:32:07" });
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("the exchange rate of a trade and the current exchange rate come back identical from the database", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(10), unitPrice: decimal(200), exchangeRate: 54213 } },
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-03-10", quantity: decimal(100), unitPrice: decimal(30) } },
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(230.5), at: "2026-09-25T10:00:00" }], exchangeRate: { rate: 53000, at: "2026-09-25T10:00:00" } },
    );

    const state = executeOk(
      database,
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-05-10", quantity: decimal(4), unitPrice: decimal(250), exchangeRate: 51575 } },
      { type: "record-quotes", quotes: [], exchangeRate: { rate: 51885, at: "2026-09-25T14:32:07" } },
    );

    const reloaded = loadPortfolio(open());
    expect(reloaded).toEqual(state);
    expect(reloaded.trades.map((t) => (t as UnitTrade).exchangeRate)).toEqual([54213, null, 51575]);
    expect(reloaded.exchangeRate).toEqual({ rate: 51885, at: "2026-09-25T14:32:07" });
    expect(projectPortfolio(reloaded, TODAY)).toEqual(projectPortfolio(state, TODAY));
  });

  it("the portfolio and the budget don't touch each other's state", () => {
    const database = open();
    const percentages = { "fixed-costs": 40, "financial-freedom": 20, comfort: 15, goals: 10, knowledge: 10, pleasures: 5 };
    const budgetSaved = executeOnDatabase(database, { type: "save-percentages", month: "2026-09", percentages }, TODAY);
    if (!budgetSaved.ok) throw new Error(budgetSaved.error);

    const portfolio = executeOk(database, saveTargets(targets(30, 20, 40, 10, 0)));

    expect(loadState(open())).toEqual(budgetSaved.value);
    const budgetAgain = executeOnDatabase(database, { type: "save-percentages", month: "2026-10", percentages }, TODAY);
    expect(budgetAgain.ok).toBe(true);
    expect(loadPortfolio(open())).toEqual(portfolio);
  });
});

function saveTargets(t: Targets): PortfolioCommand {
  return { type: "save-targets", targets: t };
}

function targets(...values: [number, number, number, number, number]): Targets {
  return Object.fromEntries(ASSET_CLASSES.map((c, i) => [c.id, values[i]])) as Targets;
}

/** Executes on the database, one transaction each, commands the domain accepts; returns the saved state. */
function executeOk(database: Database, ...commands: PortfolioCommand[]): PortfolioState {
  let state = loadPortfolio(database);
  for (const command of commands) {
    const result = executePortfolioOnDatabase(database, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}

it("initializes questionnaires once and reopens current answers and dates without changing the budget", () => {
  const database = open();
  const budget = loadState(database);
  let state = loadPortfolio(database);
  expect(state.questionnaires.map(q => q.questions.length)).toEqual([14, 6]);
  state = executeOk(database, { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } });
  state = executeOk(database, { type: "save-asset", asset: { ticker: "VNQ", assetClass: "international-stocks" } });
  for (const { id: question } of state.questionnaires[0]!.questions) state = executeOk(database, { type: "save-answer", asset: 1, question, value: true });
  const correction = executePortfolioOnDatabase(database, { type: "save-answer", asset: 1, question: 1, value: false }, "2026-09-26");
  if (!correction.ok) throw new Error(correction.error);
  state = correction.value;
  const reopened = open();
  expect(loadPortfolio(reopened)).toEqual(state);
  expect(projectPortfolio(loadPortfolio(reopened), "2026-09-26").classes[0]?.assets[0]).toMatchObject({ score: 12, evaluatedAt: "2026-09-26" });
  expect(loadState(reopened)).toEqual(budget);
  expect(executePortfolioOnDatabase(reopened, { type: "save-answer", asset: 2, question: 12, value: true }, TODAY).ok).toBe(false);
  expect(loadPortfolio(reopened)).toEqual(state);
  const deleted = executeOk(reopened, { type: "delete-asset", id: 1 });
  expect(loadPortfolio(open())).toEqual(deleted);
  expect(deleted.answers).toEqual([]);
  expect(deleted.questionnaireEvaluations).toEqual([]);
});


it("does not restore customized question text, order or removed questions when reopening", () => {
  open();
  // Fixture: a portfolio whose questionnaires were customized before reopening.
  const sqlite = new SQLite(file);
  try {
    sqlite.exec("UPDATE question SET text = 'A empresa atende ao meu critério?' WHERE id = 1; UPDATE question SET position = 20 WHERE id = 1; DELETE FROM question WHERE id = 17;");
  } finally { sqlite.close(); }
  const state = loadPortfolio(open());
  expect(state.questionnaires[0]?.questions.map(q => q.id)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 1]);
  expect(state.questionnaires[0]?.questions.at(-1)?.text).toBe("A empresa atende ao meu critério?");
  expect(state.questionnaires[1]?.questions).toHaveLength(5);
  executeOk(open(), { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } });
  expect(loadPortfolio(open()).questionnaires).toEqual(state.questionnaires);
});

it("reopens edited questionnaires with retained answers, derived scores and dates, then completes pending stocks", () => {
  const database = open();
  const budget = loadState(database);
  let state = executeOk(database,
    { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
    { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
    { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } },
  );
  for (const asset of [1, 2, 3]) {
    const questions = asset === 3 ? state.questionnaires[1]!.questions : state.questionnaires[0]!.questions;
    for (const question of questions) state = executeOk(database, { type: "save-answer", asset, question: question.id, value: question.id !== 1 });
  }
  const edited = executePortfolioOnDatabase(database, {
    type: "save-questionnaire", id: "stocks", questions: [
      { id: 20, text: "Minha pergunta reescrita?" },
      ...state.questionnaires[0]!.questions.slice(1, -1),
      { text: "Minha pergunta nova?" },
    ],
  }, "2026-09-26");
  if (!edited.ok) throw new Error(edited.error);
  state = edited.value;
  const fundEdit = executePortfolioOnDatabase(database, { type: "save-questionnaire", id: "real-estate-funds", questions: [{ id: 12, text: "Minha pergunta de FIIs?" }] }, "2026-09-26");
  if (!fundEdit.ok) throw new Error(fundEdit.error);
  state = fundEdit.value;
  const newQuestion = state.questionnaires[0]!.questions.at(-1)!.id;
  // Close all connections before reopening and running the real migrations again.
  for (const connection of opened.splice(0)) connection.close();
  const reopened = open();
  expect(loadPortfolio(reopened)).toEqual(state);
  const snapshot = projectPortfolio(loadPortfolio(reopened), "2026-09-26");
  expect(snapshot.pendingEvaluations).toBe(2);
  const views = snapshot.classes.flatMap(c => c.assets);
  for (const asset of [1, 2]) {
    expect(views.find(a => a.id === asset)).toMatchObject({ score: null, evaluatedAt: TODAY });
    expect(views.find(a => a.id === asset)?.questionnaire?.questions.map(q => q.id)).toEqual([20, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, newQuestion]);
  }
  expect(views.find(a => a.id === 3)).toMatchObject({ score: 1, evaluatedAt: TODAY });
  expect(state.answers.some(a => a.question === 1 || (a.question >= 13 && a.question <= 17))).toBe(false);
  expect(executePortfolioOnDatabase(reopened, { type: "save-questionnaire", id: "real-estate-funds", questions: [] }, "2026-09-26")).toEqual({ ok: false, error: "Mantenha pelo menos uma pergunta no questionário." });
  expect(loadPortfolio(reopened)).toEqual(state);
  for (const asset of [1, 2]) {
    const result = executePortfolioOnDatabase(reopened, { type: "save-answer", asset, question: newQuestion, value: asset === 1 }, "2026-09-27");
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  for (const connection of opened.splice(0)) connection.close();
  const finalDatabase = open();
  expect(loadPortfolio(finalDatabase).answers).toEqual(expect.arrayContaining(state.answers));
  expect(loadPortfolio(finalDatabase).answers).toHaveLength(state.answers.length);
  expect(projectPortfolio(loadPortfolio(finalDatabase), "2026-09-27")).toEqual(projectPortfolio(state, "2026-09-27"));
  const finalView = projectPortfolio(loadPortfolio(finalDatabase), "2026-09-27");
  expect(finalView.pendingEvaluations).toBe(0);
  expect(finalView.classes.flatMap(c => c.assets).find(a => a.id === 1)).toMatchObject({ score: 14, evaluatedAt: "2026-09-27" });
  expect(finalView.classes.flatMap(c => c.assets).find(a => a.id === 2)).toMatchObject({ score: 12, evaluatedAt: "2026-09-27" });
  expect(loadState(finalDatabase)).toEqual(budget);
});

it("records a mixed buy batch as ordinary trades in one transaction without touching the budget", () => {
  const database = open();
  const budget = executeOnDatabase(database, { type: "save-percentages", month: "2026-09", percentages: { "fixed-costs": 40, "financial-freedom": 20, comfort: 15, goals: 10, knowledge: 10, pleasures: 5 } }, TODAY);
  expect(budget.ok).toBe(true);
  const beforeBudget = loadState(database);
  executeOk(database,
    { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
    { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
    { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" } },
    { type: "save-asset", asset: { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(10), maturityDate: "2028-01-01" } } },
  );
  const saved = executeOk(database, { type: "save-buys", date: TODAY, buys: [
    { asset: 1, quantity: decimal(2), unitPrice: decimal(30) },
    { asset: 2, quantity: decimal(0.5), unitPrice: decimal(100), exchangeRate: 54000 },
    { asset: 3, quantity: decimal(0.001), unitPrice: decimal(300000) },
    { asset: 4, amount: 100000 },
  ] });
  const reopened = open();
  expect(loadPortfolio(reopened)).toEqual(saved);
  const views = projectPortfolio(loadPortfolio(reopened), TODAY).classes.flatMap(c => c.assets);
  expect(views.find(a => a.id === 1)).toMatchObject({ quantity: decimal(2), cost: 6000 });
  expect(views.find(a => a.id === 2)).toMatchObject({ quantity: decimal(0.5) });
  expect(views.find(a => a.id === 2)!.cost).toBeCloseTo(27000, 6);
  expect(views.find(a => a.id === 3)).toMatchObject({ quantity: decimal(0.001), cost: 30000 });
  expect(views.find(a => a.id === 4)).toMatchObject({ quantity: decimal(1000), cost: 100000 });
  expect(saved.trades.every(t => t.kind === "buy" && t.date === TODAY)).toBe(true);
  expect(loadState(reopened)).toEqual(beforeBudget);
  const corrected = executeOk(reopened, { type: "save-trade", trade: { ...saved.trades[0]!, quantity: decimal(3), unitPrice: decimal(31) } });
  const deleted = executeOk(reopened, { type: "delete-trade", id: corrected.trades[0]!.id });
  expect(loadPortfolio(open())).toEqual(deleted);
});

it.each([
  { asset: 3, quantity: decimal(1), unitPrice: 0, exchangeRate: 54000 },
  { asset: 3, quantity: decimal(1), unitPrice: decimal(100) },
  { asset: 99, quantity: decimal(1), unitPrice: decimal(100) },
])("refuses the final buy after multiple valid lines without changing either persisted context: %j", refusedBuy => {
  const database = open();
  executeOnDatabase(database, { type: "save-percentages", month: "2026-09", percentages: { "fixed-costs": 40, "financial-freedom": 20, comfort: 15, goals: 10, knowledge: 10, pleasures: 5 } }, TODAY);
  const before = executeOk(database,
    { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
    { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" } },
    { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
    { type: "save-trade", trade: { asset: 1, kind: "buy", date: TODAY, quantity: decimal(1), unitPrice: decimal(28) } },
    { type: "save-score", asset: 2, score: 8 },
    { type: "record-quotes", quotes: [{ asset: 1, price: decimal(30), at: `${TODAY}T12:00:00` }] },
  );
  const budgetBefore = loadState(database);
  const result = executePortfolioOnDatabase(database, { type: "save-buys", date: TODAY, buys: [
    { asset: 1, quantity: decimal(2), unitPrice: decimal(30) },
    { asset: 2, quantity: decimal(0.001), unitPrice: decimal(300000) },
    refusedBuy,
  ] }, TODAY);
  expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^Linha 3.*: /) });
  for (const connection of opened.splice(0)) connection.close();
  const reopened = open();
  expect(loadPortfolio(reopened)).toEqual(before);
  expect(projectPortfolio(loadPortfolio(reopened), TODAY)).toEqual(projectPortfolio(before, TODAY));
  expect(loadState(reopened)).toEqual(budgetBefore);
});

it("validates a reviewed bond purchase against the asset currently stored on the server", () => {
  const database = open();
  let before = executeOk(database, { type: "save-asset", asset: { ticker: "Tesouro", assetClass: "fixed-income", sourceId: "treasury", bond: { kind: "treasury-bond", maturityDate: "2028-01-01" } } });
  before = executeOk(database, { type: "save-asset", asset: { ...before.assets[0]!, bond: { kind: "treasury-bond", maturityDate: TODAY } } });
  expect(executePortfolioOnDatabase(database, { type: "save-buys", date: TODAY, buys: [{ asset: 1, quantity: decimal(0.01), unitPrice: decimal(3000) }] }, TODAY)).toMatchObject({ ok: false, error: expect.stringContaining("vencimento") });
  expect(loadPortfolio(open())).toEqual(before);
});
