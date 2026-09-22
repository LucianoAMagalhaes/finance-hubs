import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  trashItems,
  projectMonth,
  tagsInUse,
  type Command,
  type IsoDate,
  type IncomeToSave,
  type State,
  type ExpenseToSave,
  type Month,
} from "@/domain";

const TODAY: IsoDate = "2026-09-18";

describe("trash", () => {
  it("deleting an income removes the month's income; restoring gives back exactly the projection from before", () => {
    let state = applyOk(emptyState(), saveIncome({ date: "2026-09-05", amount: 720_000 }));
    state = applyOk(state, saveIncome({ date: "2026-09-20", amount: 90_000 }));
    state = applyOk(state, saveExpense({ date: "2026-09-12", amount: 250_000 }));
    const before = projectMonth(state, "2026-09");

    const deleted = applyOk(state, { type: "delete", record: "income", id: 1 });

    expect(projectMonth(deleted, "2026-09").monthIncome).toBe(90_000);
    expect(projectMonth(deleted, "2026-09").incomes.map((i) => i.id)).toEqual([2]);
    expect(projectMonth(deleted, "2026-09").jars.find((j) => j.id === "comfort")!.verdict).toBe("overrun");

    const restored = applyOk(deleted, { type: "restore", record: "income", id: 1 });

    expect(projectMonth(restored, "2026-09")).toEqual(before);
    expect(restored).toEqual(state);
  });

  it("deleting an installment purchase removes every installment; restoring gives them all back", () => {
    const months: Month[] = ["2026-09", "2026-10", "2026-11"];
    const state = applyOk(emptyState(), saveExpense({ date: "2026-09-12", amount: 100_000, installments: 3 }));
    const before = months.map((m) => projectMonth(state, m));

    const deleted = applyOk(state, { type: "delete", record: "expense", id: 1 });

    for (const m of months) {
      expect(projectMonth(deleted, m).occurrences).toEqual([]);
      expect(projectMonth(deleted, m).aggregates.monthExpenses).toBe(0);
    }

    const restored = applyOk(deleted, { type: "restore", record: "expense", id: 1 });

    expect(months.map((m) => projectMonth(restored, m))).toEqual(before);
    expect(months.map((m) => projectMonth(restored, m).occurrences.map((o) => o.amount))).toEqual([[33_334], [33_333], [33_333]]);
  });

  it("deleting everything in a month keeps the month's budget with its percentages", () => {
    let state = applyOk(emptyState(), saveIncome({ date: "2026-09-05" }));
    state = applyOk(state, saveExpense({ date: "2026-09-12", amount: 42_050 }));
    const percentages = { "fixed-costs": 40, "financial-freedom": 20, comfort: 15, goals: 10, knowledge: 10, pleasures: 5 };
    state = applyOk(state, { type: "save-percentages", month: "2026-09", percentages });

    state = applyOk(state, { type: "delete", record: "income", id: 1 });
    state = applyOk(state, { type: "delete", record: "expense", id: 1 });

    const view = projectMonth(state, "2026-09");
    expect(state.budgets["2026-09"]).toEqual(percentages);
    expect(view.budget.born).toBe(true);
    expect(view.jars.map((j) => j.percentage)).toEqual([40, 20, 15, 10, 10, 5]);
    expect(view.monthIncome).toBe(0);
    expect(view.jars.map((j) => j.verdict)).toEqual(Array(6).fill("no-income"));
  });

  it("the trash lists what was deleted, most recent first, and restoring takes it out of there", () => {
    let state = applyOk(emptyState(), saveIncome({ date: "2026-09-05" }));
    state = applyOk(state, saveExpense({ date: "2026-09-12", amount: 42_050 }));
    state = applyOk(state, saveExpense({ date: "2026-09-13", amount: 10_000 }));
    state = applyOk(state, { type: "delete", record: "expense", id: 2 }, "2026-09-10");
    state = applyOk(state, { type: "delete", record: "income", id: 1 }, "2026-09-18");

    expect(trashItems(state).map((i) => [i.record, i.id, i.deletedAt])).toEqual([
      ["income", 1, "2026-09-18"],
      ["expense", 2, "2026-09-10"],
    ]);

    state = applyOk(state, { type: "restore", record: "income", id: 1 });

    expect(trashItems(state).map((i) => [i.record, i.id])).toEqual([["expense", 2]]);
  });

  it("the tag of an expense in the trash is no longer in use", () => {
    let state = applyOk(emptyState(), saveExpense({ date: "2026-09-12", amount: 4_000, tag: "saúde" }));
    state = applyOk(state, saveExpense({ date: "2026-09-13", amount: 2_000, tag: "transporte" }));

    state = applyOk(state, { type: "delete", record: "expense", id: 1 });

    expect(tagsInUse(state)).toEqual(["transporte"]);
  });

  it("you cannot delete what does not exist or is already in the trash, nor restore what is not there", () => {
    let state = applyOk(emptyState(), saveIncome({ date: "2026-09-05" }));

    expect(apply(state, { type: "delete", record: "income", id: 9 }, TODAY).ok).toBe(false);
    expect(apply(state, { type: "delete", record: "expense", id: 1 }, TODAY).ok).toBe(false);
    expect(apply(state, { type: "restore", record: "income", id: 1 }, TODAY).ok).toBe(false);

    state = applyOk(state, { type: "delete", record: "income", id: 1 });

    expect(apply(state, { type: "delete", record: "income", id: 1 }, TODAY).ok).toBe(false);
  });

  it("the command comes from the browser: a record that is not one of the three is rejected", () => {
    const state = applyOk(emptyState(), saveExpense({ date: "2026-09-12", amount: 42_050 }));

    const result = apply(state, { type: "delete", record: "orcamento" as never, id: 1 }, TODAY);

    expect(result).toEqual({ ok: false, error: "Só entrada, lançamento ou antecipação vão para a lixeira." });
  });

  it("an item in the trash cannot be corrected: restore first, correct afterwards", () => {
    let state = applyOk(emptyState(), saveExpense({ date: "2026-09-12", amount: 42_050 }));
    state = applyOk(state, { type: "delete", record: "expense", id: 1 });

    const result = apply(state, saveExpense({ id: 1, date: "2026-09-12", amount: 50_000 }), TODAY);

    expect(result.ok).toBe(false);
  });

  it("a new record does not reuse the id of one that is in the trash", () => {
    let state = applyOk(emptyState(), saveIncome({ date: "2026-09-05" }));
    state = applyOk(state, { type: "delete", record: "income", id: 1 });

    state = applyOk(state, saveIncome({ date: "2026-09-06" }));

    expect(state.incomes.map((i) => i.id)).toEqual([1, 2]);
  });

  it("deleting and restoring make no month be born", () => {
    // A state from before automatic birth: the expense exists, the month has not been born.
    const state: State = {
      ...emptyState(),
      expenses: [
        { id: 1, kind: "purchase", date: "2026-09-12", description: "Café", jar: "comfort", paymentMethod: "pix", amount: 1_000, installments: 1, tag: null, prepayments: [], deletedAt: null },
      ],
    };

    const deleted = applyOk(state, { type: "delete", record: "expense", id: 1 });
    const restored = applyOk(deleted, { type: "restore", record: "expense", id: 1 });

    expect(deleted.budgets).toEqual({});
    expect(restored).toEqual(state);
  });
});

function saveIncome(fields: Partial<IncomeToSave> & { date: IsoDate }): Command {
  return {
    type: "save-income",
    income: { description: "Salário", source: "salary", paymentMethod: "transfer", amount: 720_000, ...fields },
  };
}

function saveExpense(fields: Partial<ExpenseToSave> & { date: IsoDate; amount: number }): Command {
  return {
    type: "save-expense",
    expense: { description: "Restaurante", jar: "comfort", paymentMethod: "credit-card", installments: 1, ...fields },
  };
}

function applyOk(state: State, command: Command, today: IsoDate = TODAY): State {
  const result = apply(state, command, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
