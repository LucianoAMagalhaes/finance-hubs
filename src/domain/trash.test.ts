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

describe("what an item in the trash says about itself", () => {
  /** The only item in the trash, after deleting the record with `id`. */
  function deleted(state: State, record: "income" | "expense" | "prepayment", id: number) {
    return trashItems(applyOk(state, { type: "delete", record, id }))[0]!;
  }

  it("an income says its source and the month it comes back to", () => {
    const state = applyOk(emptyState(), saveIncome({ date: "2026-09-05", description: "Salário de setembro" }));

    expect(deleted(state, "income", 1)).toMatchObject({
      description: "Salário de setembro",
      amount: 720_000,
      where: ["Entrada", "Salário", "setembro de 2026"],
    });
  });

  it("an upfront expense says its jar and its own month", () => {
    const state = applyOk(emptyState(), saveExpense({ date: "2026-09-12", amount: 42_050 }));

    expect(deleted(state, "expense", 1)).toMatchObject({
      description: "Restaurante",
      amount: 42_050,
      where: ["Gasto", "Conforto", "setembro de 2026"],
    });
  });

  it("an installment purchase says how many installments come back, and from which month", () => {
    const state = applyOk(emptyState(), saveExpense({ date: "2026-03-20", amount: 600_000, installments: 12 }));

    // The total, not the installment: deleting takes the whole purchase.
    expect(deleted(state, "expense", 1)).toMatchObject({
      amount: 600_000,
      where: ["Gasto", "Conforto", "12× a partir de março de 2026"],
    });
  });

  it("a recurring expense says since when it falls, and until when if it was ended", () => {
    const created = applyOk(emptyState(), {
      type: "create-recurring",
      recurring: { date: "2026-07-05", description: "Aluguel", jar: "fixed-costs", paymentMethod: "transfer", amount: 150_000 },
    });

    expect(deleted(created, "expense", 1)).toMatchObject({
      description: "Aluguel",
      where: ["Gasto", "Custos Fixos", "recorrente desde julho de 2026"],
    });

    const ended = applyOk(created, { type: "end-recurring", id: 1, month: "2026-09" });

    expect(deleted(ended, "expense", 1).where).toEqual(["Gasto", "Custos Fixos", "recorrente desde julho de 2026, encerrado em setembro de 2026"]);
  });

  it("a recurring expense shows its last period, which is what comes back on top", () => {
    let state = applyOk(emptyState(), {
      type: "create-recurring",
      recurring: { date: "2026-07-05", description: "Aluguel", jar: "fixed-costs", paymentMethod: "transfer", amount: 150_000 },
    });
    state = applyOk(state, {
      type: "change-recurring",
      id: 1,
      month: "2026-09",
      period: { description: "Aluguel reajustado", jar: "comfort", paymentMethod: "transfer", amount: 165_000 },
    });

    expect(deleted(state, "expense", 1)).toMatchObject({
      description: "Aluguel reajustado",
      amount: 165_000,
      where: ["Gasto", "Conforto", "recorrente desde julho de 2026"],
    });
  });

  it("a prepayment borrows the purchase's description, because on its own it explains nothing", () => {
    let state = applyOk(emptyState(), saveExpense({ date: "2026-03-20", amount: 600_000, installments: 12, description: "Notebook" }));
    state = applyOk(state, { type: "save-prepayment", prepayment: { expense: 1, date: "2026-09-02", installments: 3, amount: 140_000 } });

    expect(deleted(state, "prepayment", 1)).toMatchObject({
      description: "Notebook",
      amount: 140_000,
      where: ["Antecipação de 3 parcelas", "setembro de 2026", "volta a cortar as últimas que sobrarem"],
    });
  });

  it("a prepayment of one installment counts in the singular", () => {
    let state = applyOk(emptyState(), saveExpense({ date: "2026-03-20", amount: 600_000, installments: 12 }));
    state = applyOk(state, { type: "save-prepayment", prepayment: { expense: 1, date: "2026-09-02", installments: 1, amount: 45_000 } });

    expect(deleted(state, "prepayment", 1).where[0]).toBe("Antecipação de 1 parcela");
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
