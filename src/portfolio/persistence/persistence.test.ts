import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOnDatabase, loadState, openDatabase, type Database } from "@/persistence";
import {
  ASSET_CLASSES,
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
