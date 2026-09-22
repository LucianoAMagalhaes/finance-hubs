import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  tagsInUse,
  type Command,
  type Purchase,
  type State,
  type Month,
  type Percentages,
  type Jar,
  type Recurring,
  type PeriodToSave,
} from "@/domain";
import { openDatabase, loadState, executeOnDatabase, type Database } from "@/persistence";
import { save } from "./repository";

const TODAY = "2026-09-18";

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

describe("persistence", () => {
  it("a new database starts with the empty state", () => {
    expect(loadState(open())).toEqual(emptyState());
  });

  it("percentages of several months come back identical when reloaded from the database", () => {
    const state = executeOk(
      open(),
      savePercentages("2026-08", pcts(30, 25, 15, 15, 10, 5)),
      savePercentages("2026-09", pcts(30, 20, 20, 15, 10, 0)),
    );

    const reloaded = loadState(open());

    expect(reloaded).toEqual(state);
    for (const month of ["2026-08", "2026-09", "2026-10"] as const) {
      expect(projectMonth(reloaded, month)).toEqual(projectMonth(state, month));
    }
  });

  it("saving again a month that already exists replaces its percentages", () => {
    const database = open();
    executeOk(database, savePercentages("2026-09", pcts(30, 25, 15, 15, 10, 5)));

    executeOk(database, savePercentages("2026-09", pcts(40, 20, 15, 15, 10, 0)));

    expect(loadState(open()).budgets["2026-09"]).toEqual(pcts(40, 20, 15, 15, 10, 0));
  });

  it("a saved income comes back identical when reloaded, with the month it gave birth to", () => {
    const state = executeOk(open(), saveIncome({ date: "2026-09-05", amount: 720_050 }));

    const reloaded = loadState(open());

    expect(reloaded).toEqual(state);
    expect(projectMonth(reloaded, "2026-09")).toEqual(projectMonth(state, "2026-09"));
    expect(projectMonth(reloaded, "2026-09").budget.born).toBe(true);
  });

  it("correcting the date of an income saves the change and the target month", () => {
    const database = open();
    const before = executeOk(database, saveIncome({ date: "2026-10-05" }));
    const id = before.incomes[0]!.id;

    const after = executeOk(database, saveIncome({ id, date: "2026-09-30" }));

    const reloaded = loadState(open());
    expect(reloaded).toEqual(after);
    expect(projectMonth(reloaded, "2026-09").monthIncome).toBe(720_000);
    expect(projectMonth(reloaded, "2026-10").monthIncome).toBe(0);
  });

  it("percentages saved by command come back identical, without touching the other months", () => {
    const database = open();
    executeOk(database, saveIncome({ date: "2026-09-05" }));

    const after = executeOk(database, savePercentages("2026-10", pcts(40, 20, 15, 10, 5, 0)));

    const reloaded = loadState(open());
    expect(reloaded).toEqual(after);
    expect(reloaded.budgets["2026-10"]).toEqual(pcts(40, 20, 15, 10, 5, 0));
    expect(reloaded.budgets["2026-09"]).toEqual(pcts(30, 25, 15, 15, 10, 5));
  });

  it("a one-off expense, even a negative one, comes back identical when reloaded", () => {
    const state = executeOk(
      open(),
      saveIncome({ date: "2026-09-05" }),
      saveExpense({ date: "2026-09-12", jar: "comfort", amount: 42_050 }),
      saveExpense({ date: "2026-09-19", jar: "comfort", amount: -29_790 }),
      saveExpense({ date: "2026-10-02", jar: "goals", amount: 10_000 }),
    );

    const reloaded = loadState(open());

    expect(reloaded).toEqual(state);
    for (const month of ["2026-09", "2026-10"] as const) {
      expect(projectMonth(reloaded, month)).toEqual(projectMonth(state, month));
    }
    expect(reloaded.budgets["2026-10"]).toBeDefined();
  });

  it("an installment purchase, even an installment refund, comes back identical when reloaded", () => {
    const state = executeOk(
      open(),
      saveExpense({ date: "2026-08-31", jar: "comfort", amount: 389_900, installments: 10 }),
      saveExpense({ date: "2026-09-10", jar: "comfort", amount: -100_000, installments: 3 }),
    );

    const reloaded = loadState(open());

    expect(reloaded).toEqual(state);
    for (const month of ["2026-08", "2026-09", "2026-11", "2027-05", "2027-06"] as const) {
      expect(projectMonth(reloaded, month)).toEqual(projectMonth(state, month));
    }
    // In date order: the refund falls on the 10th; the purchase from the 31st, on the last day of November.
    expect(projectMonth(reloaded, "2026-11").occurrences.map((o) => [o.date, o.installment])).toEqual([
      ["2026-11-10", { number: 3, of: 3, total: -100_000 }],
      ["2026-11-30", { number: 4, of: 10, total: 389_900 }],
    ]);
  });

  it("correcting an expense saves the change", () => {
    const database = open();
    const before = executeOk(database, saveExpense({ date: "2026-09-12", jar: "comfort", amount: 42_050 }));
    const id = before.expenses[0]!.id;

    const after = executeOk(database, saveExpense({ id, date: "2026-09-12", jar: "goals", amount: -500 }));

    expect(loadState(open())).toEqual(after);
  });

  it("the saved tag comes back normalized, and no tag comes back as no tag", () => {
    const state = executeOk(
      open(),
      saveExpense({ date: "2026-09-12", jar: "comfort", amount: 4_000, tag: "#Saúde Mental" }),
      saveExpense({ date: "2026-09-13", jar: "comfort", amount: 2_000 }),
    );

    const reloaded = loadState(open());

    expect(reloaded.expenses.map((e) => (e as Purchase).tag)).toEqual(["saúde-mental", null]);
    expect(reloaded).toEqual(state);
    expect(projectMonth(reloaded, "2026-09")).toEqual(projectMonth(state, "2026-09"));
  });

  it("the trash mark survives reloading, and restoring removes it from the database", () => {
    const database = open();
    const deleted = executeOk(
      database,
      saveIncome({ date: "2026-09-05" }),
      saveExpense({ date: "2026-09-12", jar: "comfort", amount: 100_000, installments: 3 }),
      { type: "delete", record: "income", id: 1 },
      { type: "delete", record: "expense", id: 1 },
    );

    const reloaded = loadState(open());

    expect(reloaded).toEqual(deleted);
    expect(reloaded.incomes[0]!.deletedAt).toBe(TODAY);
    expect(reloaded.expenses[0]!.deletedAt).toBe(TODAY);
    for (const month of ["2026-09", "2026-10", "2026-11"] as const) {
      expect(projectMonth(reloaded, month)).toEqual(projectMonth(deleted, month));
      expect(projectMonth(reloaded, month).occurrences).toEqual([]);
    }
    expect(projectMonth(reloaded, "2026-09").monthIncome).toBe(0);
    expect(reloaded.budgets["2026-09"]).toBeDefined();

    const restored = executeOk(database, { type: "restore", record: "expense", id: 1 });

    expect(loadState(open())).toEqual(restored);
    expect(loadState(open()).expenses[0]!.deletedAt).toBeNull();
  });

  it("the prepayments of an installment purchase come back identical when reloaded, with the series already cut", () => {
    const state = executeOk(
      open(),
      saveExpense({ date: "2026-01-15", jar: "comfort", amount: 389_900, installments: 10 }),
      prepay({ date: "2026-07-20", installments: 1, amount: 36_000 }),
      prepay({ date: "2026-08-10", installments: 1, amount: 35_000 }),
    );

    const reloaded = loadState(open());

    expect(reloaded).toEqual(state);
    expect((reloaded.expenses[0] as Purchase).prepayments).toEqual([
      { id: 1, date: "2026-07-20", installments: 1, amount: 36_000, deletedAt: null },
      { id: 2, date: "2026-08-10", installments: 1, amount: 35_000, deletedAt: null },
    ]);
    for (const month of ["2026-07", "2026-08", "2026-09", "2026-10"] as const) {
      expect(projectMonth(reloaded, month), month).toEqual(projectMonth(state, month));
    }
    expect(projectMonth(reloaded, "2026-09").occurrences).toEqual([]);
  });

  it("correcting a prepayment doesn't change its place: the saved state comes back identical", () => {
    const database = open();
    executeOk(
      database,
      saveExpense({ date: "2026-01-15", jar: "comfort", amount: 389_900, installments: 10 }),
      prepay({ date: "2026-07-20", installments: 1, amount: 36_000 }),
      prepay({ date: "2026-08-10", installments: 1, amount: 35_000 }),
    );

    const after = executeOk(database, prepay({ id: 1, date: "2026-07-20", installments: 1, amount: 30_000 }));

    const reloaded = loadState(open());
    expect(reloaded).toEqual(after);
    expect((reloaded.expenses[0] as Purchase).prepayments.map((p) => [p.id, p.amount])).toEqual([
      [1, 30_000],
      [2, 35_000],
    ]);
  });

  it("an undone prepayment comes back from the trash through the database, and the installments come back with it", () => {
    const database = open();
    const before = executeOk(
      database,
      saveExpense({ date: "2026-01-15", jar: "comfort", amount: 389_900, installments: 10 }),
      prepay({ date: "2026-07-20", installments: 3, amount: 300_000 }),
    );
    const undone = executeOk(database, { type: "delete", record: "prepayment", id: 1 });

    const reloaded = loadState(open());

    expect(reloaded).toEqual(undone);
    expect((reloaded.expenses[0] as Purchase).prepayments[0]!.deletedAt).toBe(TODAY);
    expect(projectMonth(reloaded, "2026-10").occurrences).toHaveLength(1);

    executeOk(database, { type: "restore", record: "prepayment", id: 1 });

    expect(loadState(open())).toEqual(before);
  });

  it("a recurring expense with several periods, even ended or a refund, comes back identical when reloaded", () => {
    const state = executeOk(
      open(),
      createRecurring({ date: "2026-01-31", amount: 150_000, tag: "casa" }),
      changeRecurring(1, "2026-03", { amount: 155_000, jar: "goals", tag: null }),
      changeRecurring(1, "2026-07", { amount: 165_000, tag: "#Moradia" }),
      createRecurring({ date: "2026-02-10", amount: -2_000 }),
      { type: "end-recurring", id: 2, month: "2026-06" },
    );

    const reloaded = loadState(open());

    expect(reloaded).toEqual(state);
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-05", "2026-06", "2026-07", "2030-02"] as const) {
      expect(projectMonth(reloaded, month)).toEqual(projectMonth(state, month));
    }
    expect(projectMonth(reloaded, "2028-02").occurrences.map((o) => [o.date, o.amount, o.tag])).toEqual([["2028-02-29", 165_000, "moradia"]]);
  });

  it("purchases and recurring expenses come back in the order they were entered", () => {
    executeOk(
      open(),
      saveExpense({ date: "2026-09-12", jar: "comfort", amount: 1_000 }),
      createRecurring({ date: "2026-09-05" }),
      saveExpense({ date: "2026-09-13", jar: "comfort", amount: 2_000 }),
    );

    expect(loadState(open()).expenses.map((e) => [e.id, e.kind])).toEqual([
      [1, "purchase"],
      [2, "recurring"],
      [3, "purchase"],
    ]);
  });

  it("ending saves the end and deletes the discarded periods from the database", () => {
    const database = open();
    executeOk(
      database,
      createRecurring({ date: "2026-01-05" }),
      changeRecurring(1, "2026-10", { amount: 11_000 }),
      changeRecurring(1, "2026-12", { amount: 12_000 }),
    );

    const after = executeOk(database, { type: "end-recurring", id: 1, month: "2026-09" });

    const reloaded = loadState(open());
    expect(reloaded).toEqual(after);
    expect(projectMonth(reloaded, "2026-12").occurrences).toEqual([]);
  });

  // The three broken saves below come from no command — the domain doesn't
  // produce a null description —, so they go in through the inner save.

  it("ending is saved in a single transaction: if a row fails, the end and the periods stay as they were", () => {
    const database = open();
    const before = executeOk(
      database,
      createRecurring({ date: "2026-01-05" }),
      changeRecurring(1, "2026-05", { amount: 11_000 }),
      changeRecurring(1, "2026-10", { amount: 12_000 }),
    );
    const ended = applyOk(before, { type: "end-recurring", id: 1, month: "2026-09" });
    // A period the database refuses (null description), saved after the end and the cleanup of the discarded ones.
    const r = ended.expenses[0] as Recurring;
    const broken: State = {
      ...ended,
      expenses: [{ ...r, periods: [r.periods[0]!, { ...r.periods[1]!, description: null as never }] }],
    };

    expect(() => saveState(database, broken)).toThrow();

    expect(loadState(open())).toEqual(before);
  });

  it("renaming a tag saves the new name in the purchases and in the periods, in every month", () => {
    const database = open();
    executeOk(
      database,
      saveExpense({ date: "2026-01-10", jar: "comfort", amount: 30_000, tag: "transporte" }),
      saveExpense({ date: "2026-02-05", jar: "comfort", amount: 120_000, installments: 12, tag: "uber" }),
      createRecurring({ date: "2026-01-15", tag: "transporte" }),
      changeRecurring(3, "2026-06", { amount: 28_000, tag: "uber" }),
    );

    // The merge joins the two: a purchase, an installment purchase and both periods become #uber.
    const after = executeOk(database, { type: "rename-tag", from: "transporte", to: "uber", merge: true });

    const reloaded = loadState(open());
    expect(reloaded).toEqual(after);
    expect(reloaded.expenses.map((e) => (e.kind === "purchase" ? e.tag : e.periods.map((p) => p.tag)))).toEqual([
      "uber",
      "uber",
      ["uber", "uber"],
    ]);
    for (const month of ["2026-01", "2026-02", "2026-06", "2027-01"] as const) {
      expect(projectMonth(reloaded, month), month).toEqual(projectMonth(after, month));
    }
  });

  it("renaming is saved in a single transaction: if a row fails, no expense changes tag", () => {
    const database = open();
    const before = executeOk(
      database,
      saveExpense({ date: "2026-01-10", jar: "comfort", amount: 30_000, tag: "transporte" }),
      createRecurring({ date: "2026-01-15", tag: "transporte" }),
    );
    const renamed = applyOk(before, { type: "rename-tag", from: "transporte", to: "mobilidade", merge: false });
    // A period the database refuses (null description), saved after the purchase already renamed.
    const r = renamed.expenses[1] as Recurring;
    const broken: State = {
      ...renamed,
      expenses: [renamed.expenses[0]!, { ...r, periods: [{ ...r.periods[0]!, description: null as never }] }],
    };

    expect(() => saveState(database, broken)).toThrow();

    const reloaded = loadState(open());
    expect(reloaded).toEqual(before);
    // The purchase is saved before the recurring expense: without the transaction, it would have kept the new name.
    expect((reloaded.expenses[0] as Purchase).tag).toBe("transporte");
    expect(tagsInUse(reloaded)).toEqual(["transporte"]);
  });

  it("the born budget and the income go in the same transaction: either both, or neither", () => {
    const state = applyOk(emptyState(), saveIncome({ date: "2026-09-05" }));
    // An income the database refuses (null description), saved after the budget.
    const broken: State = { ...state, incomes: [{ ...state.incomes[0]!, description: null as never }] };

    expect(() => saveState(open(), broken)).toThrow();

    expect(loadState(open())).toEqual(emptyState());
  });
});

describe("execute on the database", () => {
  it("an accepted command is saved, and returns the state the database reloads", () => {
    const database = open();
    executeOk(database, saveIncome({ date: "2026-09-05" }));

    const result = executeOnDatabase(database, saveExpense({ date: "2026-09-10", jar: "comfort", amount: 30_000 }), TODAY);

    if (!result.ok) throw new Error(result.error);
    expect(result.value.incomes).toHaveLength(1);
    expect(result.value.expenses).toHaveLength(1);
    expect(loadState(open())).toEqual(result.value);
  });

  it("a refused command returns the domain's text and leaves the database as it was", () => {
    const database = open();
    const before = executeOk(database, saveIncome({ date: "2026-09-05" }));

    const result = executeOnDatabase(database, { type: "delete", record: "expense", id: 99 }, TODAY);

    expect(result).toEqual({ ok: false, error: "Esse lançamento não existe mais." });
    expect(loadState(open())).toEqual(before);
  });
});

function saveIncome(fields: { id?: number; date: `${number}-${number}-${number}`; amount?: number }): Command {
  return {
    type: "save-income",
    income: { description: "Salário", source: "salary", paymentMethod: "transfer", amount: 720_000, ...fields },
  };
}

function savePercentages(month: Month, percentages: Percentages): Command {
  return { type: "save-percentages", month, percentages };
}

function prepay(fields: { id?: number; date: `${number}-${number}-${number}`; installments: number; amount: number }): Command {
  return { type: "save-prepayment", prepayment: { expense: 1, ...fields } };
}

function saveExpense(fields: {
  id?: number;
  date: `${number}-${number}-${number}`;
  jar: Jar;
  amount: number;
  installments?: number;
  tag?: string;
}): Command {
  return {
    type: "save-expense",
    expense: { description: "Restaurante", paymentMethod: "credit-card", installments: 1, ...fields },
  };
}

function createRecurring(fields: Partial<PeriodToSave> & { date: `${number}-${number}-${number}` }): Command {
  return {
    type: "create-recurring",
    recurring: { description: "Aluguel", jar: "fixed-costs", paymentMethod: "boleto", amount: 10_000, ...fields },
  };
}

function changeRecurring(id: number, month: Month, fields: Partial<PeriodToSave>): Command {
  return {
    type: "change-recurring",
    id,
    month,
    period: { description: "Aluguel", jar: "fixed-costs", paymentMethod: "boleto", amount: 10_000, ...fields },
  };
}

/** Saves any state in a single transaction, as executeOnDatabase would with what the domain returns. */
function saveState({ db }: Database, state: State): void {
  db.transaction((tx) => save(tx, state));
}

/** Executes on the database, one transaction each, commands the domain accepts; returns the saved state. */
function executeOk(database: Database, ...commands: Command[]): State {
  let state = loadState(database);
  for (const command of commands) {
    const result = executeOnDatabase(database, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}

function applyOk(state: State, command: Command): State {
  const result = apply(state, command, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function pcts(...values: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((j, i) => [j.id, values[i]])) as Percentages;
}
