import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOnDatabase, loadState, openDatabase, type Database } from "@/persistence";
import {
  ASSET_CLASSES,
  decimal,
  DEFAULT_TARGETS,
  emptyPortfolio,
  projectPortfolio,
  type PortfolioCommand,
  type PortfolioState,
  type Targets,
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
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto" } },
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

  it("a corrected ticker is rewritten, keeping the asset and its trades", () => {
    const database = open();
    executeOk(
      database,
      { type: "save-asset", asset: { ticker: "ELET3", assetClass: "domestic-stocks" } },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(10), unitPrice: decimal(40) } },
    );

    const corrected = executeOk(database, { type: "save-asset", asset: { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks" } });

    expect(loadPortfolio(open())).toEqual(corrected);
    expect(corrected.assets).toEqual([{ id: 1, ticker: "AXIA3", assetClass: "domestic-stocks" }]);
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
