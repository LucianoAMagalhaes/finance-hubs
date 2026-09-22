import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  type Command,
  type IsoDate,
  type IncomeToSave,
  type State,
  type NewIncome,
  type Percentages,
  type MonthView,
} from "@/domain";

const TODAY: IsoDate = "2026-09-18";

describe("incomes and month income", () => {
  it("an income makes the month's income exist, and with it the six limits", () => {
    const state = save(emptyState(), income({ date: "2026-09-05", amount: 1_000_000 }));

    const view = projectMonth(state, "2026-09");

    expect(view.monthIncome).toBe(1_000_000);
    expect(view.aggregates.monthIncome).toBe(1_000_000);
    expect(view.jars.map((j) => j.limit)).toEqual([300_000, 250_000, 150_000, 150_000, 100_000, 50_000]);
    expect(view.jars.map((j) => j.verdict)).toEqual(Array(6).fill("leftover"));
  });

  it("the month income is the sum of the month's incomes, and only of them", () => {
    let state = save(emptyState(), income({ date: "2026-09-05", amount: 720_000 }));
    state = save(state, income({ date: "2026-09-20", amount: 90_000, source: "freelance", paymentMethod: "pix" }));
    state = save(state, income({ date: "2026-10-05", amount: 500_000 }));

    expect(projectMonth(state, "2026-09").monthIncome).toBe(810_000);
    expect(projectMonth(state, "2026-10").monthIncome).toBe(500_000);
    expect(projectMonth(state, "2026-08").monthIncome).toBe(0);
  });

  it("the limit is exact: the fraction of a cent is not rounded", () => {
    const state = save(emptyState(), income({ date: "2026-09-05", amount: 333 }));

    // 5% of R$ 3,33 = 16.65 cents
    expect(jarOf(projectMonth(state, "2026-09"), "pleasures").limit).toBeCloseTo(16.65, 10);
  });

  it("the unallocated shows up in reais when there is income", () => {
    let state: State = { ...emptyState(), budgets: { "2026-09": pcts(30, 20, 15, 15, 5, 5) } };
    state = save(state, income({ date: "2026-09-05", amount: 500_000 }));

    expect(projectMonth(state, "2026-09").unallocated).toEqual({ percentage: 10, amount: 50_000 });
    expect(projectMonth(emptyState(), "2026-09").unallocated).toEqual({ percentage: 0, amount: null });
  });

  it("the view brings the month's incomes in date order", () => {
    let state = save(emptyState(), income({ date: "2026-09-20", description: "Freela", source: "freelance" }));
    state = save(state, income({ date: "2026-09-05", description: "Salário" }));
    state = save(state, income({ date: "2026-10-05", description: "Salário outubro" }));

    expect(projectMonth(state, "2026-09").incomes.map((i) => [i.date, i.description, i.source])).toEqual([
      ["2026-09-05", "Salário", "salary"],
      ["2026-09-20", "Freela", "freelance"],
    ]);
  });

  it("editing an income changes the amount and moves the month income along", () => {
    const state = save(emptyState(), income({ date: "2026-09-05", amount: 720_000 }));
    const id = projectMonth(state, "2026-09").incomes[0]!.id;

    const edited = save(state, { ...income({ date: "2026-09-05", amount: 750_000 }), id });

    expect(projectMonth(edited, "2026-09").monthIncome).toBe(750_000);
    expect(projectMonth(edited, "2026-09").incomes).toHaveLength(1);
  });

  it("moving the date to another month takes the month income along and makes the target month be born", () => {
    const state = save(emptyState(), income({ date: "2026-10-05", amount: 720_000 }));
    const id = projectMonth(state, "2026-10").incomes[0]!.id;

    const moved = save(state, { ...income({ date: "2026-09-30", amount: 720_000 }), id });

    const october = projectMonth(moved, "2026-10");
    const september = projectMonth(moved, "2026-09");
    expect(october.monthIncome).toBe(0);
    expect(october.jars.every((j) => j.limit === null && j.verdict === "no-income")).toBe(true);
    expect(october.budget.born).toBe(true);
    expect(september.monthIncome).toBe(720_000);
    expect(september.budget.born).toBe(true);
  });

  it("editing an income that does not exist is rejected", () => {
    const result = apply(emptyState(), saveIncome({ ...income({}), id: 42 }), TODAY);

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/não existe/) });
  });
});

describe("income validation", () => {
  it.each(["credit-card", "debit-card", "boleto", "direct-debit"] as const)(
    "payment method %s is rejected: incomes only in Cash, PIX or Transfer",
    (method) => {
      // The type forbids it, but the command comes from the browser: the domain checks again.
      const result = apply(emptyState(), saveIncome(income({ paymentMethod: method as never })), TODAY);

      expect(result.ok).toBe(false);
    },
  );

  it.each(["cash", "pix", "transfer"] as const)("payment method %s is accepted", (method) => {
    expect(apply(emptyState(), saveIncome(income({ paymentMethod: method })), TODAY).ok).toBe(true);
  });

  it.each([
    ["zero amount", { amount: 0 }],
    ["negative amount", { amount: -10_000 }],
    ["amount with a fraction of a cent", { amount: 100.5 }],
    ["blank description", { description: "   " }],
    ["missing description, in a malformed command", { description: undefined as never }],
    ["source not on the list", { source: "herança" as never }],
    ["date that does not exist", { date: "2026-02-30" as IsoDate }],
    ["malformed date", { date: "30/09/2026" as IsoDate }],
  ])("%s is rejected", (_, fields) => {
    const result = apply(emptyState(), saveIncome(income(fields)), TODAY);

    expect(result.ok).toBe(false);
  });

  it("a rejected command neither changes the state nor makes a month be born", () => {
    const state = emptyState();

    apply(state, saveIncome(income({ amount: 0 })), TODAY);

    expect(projectMonth(state, "2026-09").budget.born).toBe(false);
  });

  it("the description is stored without the surrounding spaces", () => {
    const state = save(emptyState(), income({ date: "2026-09-05", description: "  Salário  " }));

    expect(projectMonth(state, "2026-09").incomes[0]!.description).toBe("Salário");
  });
});

describe("month birth when saving an income", () => {
  it("the income's month is born with the percentages it would inherit", () => {
    const state: State = { ...emptyState(), budgets: { "2026-08": pcts(40, 20, 10, 10, 10, 10) } };

    const saved = save(state, income({ date: "2026-09-05" }));

    const view = projectMonth(saved, "2026-09");
    expect(view.budget).toEqual({ born: true, inheritedFrom: null });
    expect(view.jars.map((j) => j.percentage)).toEqual([40, 20, 10, 10, 10, 10]);
  });

  it("a March salary entered with September already born makes March be born with the defaults", () => {
    let state = save(emptyState(), income({ date: "2026-09-05" }));
    state = { ...state, budgets: { ...state.budgets, "2026-09": pcts(50, 10, 10, 10, 10, 10) } };

    const saved = save(state, income({ date: "2026-03-05" }));

    const march = projectMonth(saved, "2026-03");
    expect(march.budget.born).toBe(true);
    expect(march.jars.map((j) => j.percentage)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("interleaved case: December inherits from October even with January already born from September", () => {
    let state: State = { ...emptyState(), budgets: { "2026-09": pcts(50, 10, 10, 10, 10, 10) } };
    state = save(state, income({ date: "2027-01-05" }));
    state = { ...state, budgets: { ...state.budgets, "2026-10": pcts(20, 20, 20, 20, 10, 10) } };

    const saved = save(state, income({ date: "2026-12-05" }));

    expect(projectMonth(saved, "2027-01").jars.map((j) => j.percentage)).toEqual([50, 10, 10, 10, 10, 10]);
    expect(projectMonth(saved, "2026-12").jars.map((j) => j.percentage)).toEqual([20, 20, 20, 20, 10, 10]);
  });

  it("a month already born does not have its percentages replaced by a new income", () => {
    let state: State = {
      ...emptyState(),
      budgets: { "2026-08": pcts(40, 20, 10, 10, 10, 10), "2026-09": pcts(30, 30, 10, 10, 10, 10) },
    };

    state = save(state, income({ date: "2026-09-05" }));

    expect(projectMonth(state, "2026-09").jars.map((j) => j.percentage)).toEqual([30, 30, 10, 10, 10, 10]);
  });

  it("applying does not change the received state", () => {
    const state = emptyState();

    save(state, income({ date: "2026-09-05" }));

    expect(state).toEqual(emptyState());
  });
});

function income(fields: Partial<NewIncome>): NewIncome {
  return {
    date: "2026-09-05",
    description: "Salário",
    source: "salary",
    paymentMethod: "transfer",
    amount: 720_000,
    ...fields,
  };
}

function saveIncome(income: IncomeToSave): Command {
  return { type: "save-income", income };
}

function save(state: State, income: IncomeToSave): State {
  const result = apply(state, saveIncome(income), TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function jarOf(view: MonthView, id: string) {
  return view.jars.find((j) => j.key === id)!;
}

function pcts(...values: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((j, i) => [j.id, values[i]])) as Percentages;
}
