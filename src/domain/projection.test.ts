import { describe, expect, it } from "vitest";
import {
  emptyState,
  JARS,
  projectMonth,
  type State,
  type Percentages,
  type MonthView,
} from "@/domain";

describe("month projection", () => {
  it("in an empty state, the month inherits the default percentages and has not been born", () => {
    const view = projectMonth(emptyState(), "2026-09");

    expect(view.budget).toEqual({ born: false, inheritedFrom: null });
    expect(view.jars.map((j) => [j.name, j.percentage])).toEqual([
      ["Custos Fixos", 30],
      ["Liberdade Financeira", 25],
      ["Conforto", 15],
      ["Metas", 15],
      ["Conhecimento", 10],
      ["Prazeres", 5],
    ]);
  });

  it("a month without a budget inherits from the most recent earlier month that has its own", () => {
    const state: State = {
      ...emptyState(),
      budgets: {
        "2026-01": pcts(40, 20, 10, 10, 10, 10),
        "2026-03": pcts(35, 25, 15, 15, 5, 5),
        "2026-06": pcts(20, 20, 20, 20, 10, 10),
      },
    };

    const view = projectMonth(state, "2026-05");

    expect(view.budget).toEqual({ born: false, inheritedFrom: "2026-03" });
    expect(percentagesOf(view)).toEqual([35, 25, 15, 15, 5, 5]);
  });

  it("December inherits from October even with the following January already born", () => {
    const state: State = {
      ...emptyState(),
      budgets: {
        "2026-10": pcts(30, 30, 10, 10, 10, 10),
        "2027-01": pcts(50, 10, 10, 10, 10, 10),
      },
    };

    const view = projectMonth(state, "2026-12");

    expect(view.budget.inheritedFrom).toBe("2026-10");
    expect(percentagesOf(view)).toEqual([30, 30, 10, 10, 10, 10]);
  });

  it("a month earlier than every born one inherits the defaults", () => {
    const state: State = { ...emptyState(), budgets: { "2026-09": pcts(50, 10, 10, 10, 10, 10) } };

    const view = projectMonth(state, "2026-03");

    expect(view.budget).toEqual({ born: false, inheritedFrom: null });
    expect(percentagesOf(view)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("a born month shows its own percentages", () => {
    const state: State = {
      ...emptyState(),
      budgets: {
        "2026-08": pcts(30, 25, 15, 15, 10, 5),
        "2026-09": pcts(30, 20, 20, 15, 10, 5),
      },
    };

    const view = projectMonth(state, "2026-09");

    expect(view.budget).toEqual({ born: true, inheritedFrom: null });
    expect(percentagesOf(view)).toEqual([30, 20, 20, 15, 10, 5]);
  });

  it("with no income in the month, no jar has a limit nor a verdict other than 'no income'", () => {
    const view = projectMonth(emptyState(), "2026-09");

    expect(view.monthIncome).toBe(0);
    for (const jar of view.jars) {
      expect(jar).toMatchObject({ total: 0, limit: null, verdict: "no-income" });
    }
  });

  it("with no records at all, the month's four aggregates are zero", () => {
    const view = projectMonth(emptyState(), "2026-09");

    expect(view.aggregates).toEqual({ monthIncome: 0, monthExpenses: 0, monthBalance: 0, accountBalance: 0 });
  });

  it("the unallocated is what the six percentages leave out", () => {
    const state: State = { ...emptyState(), budgets: { "2026-09": pcts(30, 20, 15, 15, 5, 5) } };

    expect(projectMonth(state, "2026-09").unallocated.percentage).toBe(10);
    expect(projectMonth(emptyState(), "2026-09").unallocated.percentage).toBe(0);
  });

  it("projecting a month does not make it be born", () => {
    const state = emptyState();

    projectMonth(state, "2026-09");

    expect(projectMonth(state, "2026-09").budget.born).toBe(false);
  });
});

function pcts(...values: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((j, i) => [j.id, values[i]])) as Percentages;
}

function percentagesOf(view: MonthView): number[] {
  return view.jars.map((j) => j.percentage);
}
