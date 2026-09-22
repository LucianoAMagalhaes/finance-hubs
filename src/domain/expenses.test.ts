import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  type Command,
  type IsoDate,
  type State,
  type ExpenseToSave,
  type NewExpense,
  type Percentages,
  type MonthView,
} from "@/domain";

const TODAY: IsoDate = "2026-09-18";

/** September born with the defaults and R$ 10.000,00 of income: Comfort has a R$ 1.500,00 limit. */
function withIncome(amount = 1_000_000): State {
  return {
    ...emptyState(),
    budgets: { "2026-09": pcts(30, 25, 15, 15, 10, 5) },
    incomes: [{ id: 1, date: "2026-09-05", description: "Salário", source: "salary", paymentMethod: "transfer", amount, deletedAt: null }],
  };
}

describe("upfront expense", () => {
  it("the expense counts toward the jar's total, and only its own jar", () => {
    const state = save(withIncome(), upfront({ jar: "comfort", amount: 42_000 }));

    const view = projectMonth(state, "2026-09");

    expect(jarOf(view, "comfort").total).toBe(42_000);
    expect(view.jars.filter((j) => j.id !== "comfort").every((j) => j.total === 0)).toBe(true);
  });

  it("the expense weighs only on the month of its date", () => {
    const state = save(withIncome(), upfront({ date: "2026-10-02", jar: "comfort", amount: 42_000 }));

    expect(jarOf(projectMonth(state, "2026-09"), "comfort").total).toBe(0);
    expect(jarOf(projectMonth(state, "2026-10"), "comfort").total).toBe(42_000);
  });

  it("an upfront purchase is a one-installment purchase: one occurrence in the month, with the total", () => {
    const state = save(withIncome(), upfront({ description: "Jantar", jar: "pleasures", paymentMethod: "pix", amount: 18_990 }));

    const view = projectMonth(state, "2026-09");

    expect(view.occurrences).toEqual([
      { expense: 1, date: "2026-09-12", description: "Jantar", jar: "pleasures", paymentMethod: "pix", tag: null, amount: 18_990, installment: null, recurring: null, prepayment: null },
    ]);
    expect(state.expenses[0]).toMatchObject({ amount: 18_990, installments: 1 });
  });

  it("the month's occurrences come in date order", () => {
    let state = save(withIncome(), upfront({ date: "2026-09-20", description: "Farmácia" }));
    state = save(state, upfront({ date: "2026-09-03", description: "Mercado" }));
    state = save(state, upfront({ date: "2026-10-01", description: "Outubro" }));

    expect(projectMonth(state, "2026-09").occurrences.map((o) => o.description)).toEqual(["Mercado", "Farmácia"]);
  });

  it("editing the expense changes the jar's total, and moving it to another jar takes the total along", () => {
    const state = save(withIncome(), upfront({ jar: "comfort", amount: 42_000 }));
    const id = state.expenses[0]!.id;

    const edited = save(state, { ...upfront({ jar: "goals", amount: 50_000 }), id });

    const view = projectMonth(edited, "2026-09");
    expect(jarOf(view, "comfort").total).toBe(0);
    expect(jarOf(view, "goals").total).toBe(50_000);
    expect(view.occurrences).toHaveLength(1);
  });

  it("editing an expense that does not exist is rejected", () => {
    const result = apply(withIncome(), saveExpense({ ...upfront({}), id: 42 }), TODAY);

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/não existe/) });
  });
});

describe("verdict", () => {
  // 15% of R$ 3,33 = 49.95 cents: the exact limit has a fraction of a cent.
  it("one cent above the exact limit is Overrun, with the exact overrun", () => {
    const state = save(withIncome(333), upfront({ jar: "comfort", amount: 50 }));

    const comfort = jarOf(projectMonth(state, "2026-09"), "comfort");

    expect(comfort.verdict).toBe("overrun");
    expect(comfort.overrun).toBeCloseTo(0.05, 10);
  });

  it("exactly at the limit is Leftover", () => {
    const state = save(withIncome(), upfront({ jar: "comfort", amount: 150_000 }));

    const comfort = jarOf(projectMonth(state, "2026-09"), "comfort");

    expect(comfort.verdict).toBe("leftover");
    expect(comfort.overrun).toBe(0);
  });

  it("one cent above the limit is Overrun by one cent", () => {
    const state = save(withIncome(), upfront({ jar: "comfort", amount: 150_001 }));

    const comfort = jarOf(projectMonth(state, "2026-09"), "comfort");

    expect(comfort.verdict).toBe("overrun");
    expect(comfort.overrun).toBe(1);
  });

  it("a month without income is No income, even with expenses", () => {
    const state = save(emptyState(), upfront({ jar: "comfort", amount: 42_000 }));

    const comfort = jarOf(projectMonth(state, "2026-09"), "comfort");

    expect(comfort).toMatchObject({ total: 42_000, limit: null, verdict: "no-income", overrun: null });
  });
});

describe("refund", () => {
  it("reduces the jar's total and the Expenses, without touching the income or the limits", () => {
    const withExpense = save(withIncome(), upfront({ jar: "comfort", amount: 80_000 }));
    const before = projectMonth(withExpense, "2026-09");

    const after = projectMonth(save(withExpense, upfront({ jar: "comfort", amount: -29_790 })), "2026-09");

    expect(jarOf(after, "comfort").total).toBe(50_210);
    expect(after.aggregates.monthExpenses).toBe(50_210);
    expect(after.monthIncome).toBe(before.monthIncome);
    expect(after.jars.map((j) => j.limit)).toEqual(before.jars.map((j) => j.limit));
  });

  it("can leave the jar's total negative", () => {
    const state = save(withIncome(), upfront({ jar: "comfort", amount: -29_790 }));

    const comfort = jarOf(projectMonth(state, "2026-09"), "comfort");

    expect(comfort.total).toBe(-29_790);
    expect(comfort.verdict).toBe("leftover");
  });

  it("takes a jar out of overrun", () => {
    let state = save(withIncome(), upfront({ jar: "comfort", amount: 160_000 }));
    state = save(state, upfront({ jar: "comfort", amount: -10_000 }));

    expect(jarOf(projectMonth(state, "2026-09"), "comfort").verdict).toBe("leftover");
  });
});

describe("month aggregates", () => {
  it("Expenses is the sum of the six jars, and Month balance is Income − Expenses", () => {
    let state = save(withIncome(), upfront({ jar: "fixed-costs", amount: 150_000 }));
    state = save(state, upfront({ jar: "comfort", amount: 42_000 }));
    state = save(state, upfront({ jar: "pleasures", amount: 18_990 }));
    state = save(state, upfront({ jar: "comfort", amount: -5_000 }));
    state = save(state, upfront({ date: "2026-10-01", jar: "goals", amount: 99_999 }));

    const view = projectMonth(state, "2026-09");

    const jarsSum = view.jars.reduce((s, j) => s + j.total, 0);
    expect(view.aggregates.monthExpenses).toBe(205_990);
    expect(view.aggregates.monthExpenses).toBe(jarsSum);
    expect(view.aggregates.monthBalance).toBe(1_000_000 - 205_990);
  });

  it("Account balance ignores the occurrences on the Credit Card", () => {
    let state = save(withIncome(), upfront({ paymentMethod: "credit-card", amount: 300_000 }));
    state = save(state, upfront({ paymentMethod: "pix", amount: 50_000 }));
    state = save(state, upfront({ paymentMethod: "debit-card", amount: 20_000 }));
    state = save(state, upfront({ paymentMethod: "credit-card", amount: -10_000 }));

    const { aggregates } = projectMonth(state, "2026-09");

    expect(aggregates.monthExpenses).toBe(360_000);
    expect(aggregates.accountBalance).toBe(1_000_000 - 70_000);
  });

  it("spending more than came in leaves the balance negative", () => {
    const state = save(withIncome(100_000), upfront({ amount: 150_000 }));

    expect(projectMonth(state, "2026-09").aggregates.monthBalance).toBe(-50_000);
  });
});

describe("expense validation", () => {
  it.each(["cash", "credit-card", "debit-card", "pix", "transfer", "boleto", "direct-debit"] as const)(
    "payment method %s is accepted",
    (method) => {
      expect(apply(emptyState(), saveExpense(upfront({ paymentMethod: method })), TODAY).ok).toBe(true);
    },
  );

  it.each([
    ["zero amount", { amount: 0 }],
    ["amount with a fraction of a cent", { amount: 100.5 }],
    ["amount that is not a number", { amount: "100" as never }],
    ["blank description", { description: "   " }],
    ["missing description, in a malformed command", { description: undefined as never }],
    ["jar not on the list", { jar: "viagens" as never }],
    ["payment method not on the list", { paymentMethod: "cheque" as never }],
    ["date that does not exist", { date: "2026-02-30" as IsoDate }],
    ["malformed date", { date: "12/09/2026" as IsoDate }],
  ])("%s is rejected", (_, fields) => {
    expect(apply(emptyState(), saveExpense(upfront(fields)), TODAY).ok).toBe(false);
  });

  it("the description is stored without the surrounding spaces", () => {
    const state = save(emptyState(), upfront({ description: "  Mercado  " }));

    expect(state.expenses[0]).toMatchObject({ description: "Mercado" });
  });
});

describe("month birth when saving an expense", () => {
  it("the month of the expense's date is born with the percentages it would inherit", () => {
    const state: State = { ...emptyState(), budgets: { "2026-08": pcts(40, 20, 10, 10, 10, 10) } };

    const saved = save(state, upfront({ date: "2026-09-12" }));

    const view = projectMonth(saved, "2026-09");
    expect(view.budget).toEqual({ born: true, inheritedFrom: null });
    expect(view.jars.map((j) => j.percentage)).toEqual([40, 20, 10, 10, 10, 10]);
  });

  it("a rejected command neither changes the state nor makes a month be born", () => {
    const state = emptyState();

    apply(state, saveExpense(upfront({ amount: 0 })), TODAY);

    expect(state).toEqual(emptyState());
  });
});

function upfront(fields: Partial<NewExpense>): ExpenseToSave {
  return {
    date: "2026-09-12",
    description: "Mercado",
    jar: "fixed-costs",
    paymentMethod: "debit-card",
    amount: 10_000,
    installments: 1,
    ...fields,
  };
}

function saveExpense(expense: ExpenseToSave): Command {
  return { type: "save-expense", expense };
}

function save(state: State, expense: ExpenseToSave): State {
  const result = apply(state, saveExpense(expense), TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function jarOf(view: MonthView, id: string) {
  return view.jars.find((j) => j.id === id)!;
}

function pcts(...values: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((j, i) => [j.id, values[i]])) as Percentages;
}
