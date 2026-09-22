import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  type Command,
  type IsoDate,
  type State,
  type Month,
  type Percentages,
  type MonthView,
} from "@/domain";

const TODAY: IsoDate = "2026-09-18";

describe("editing the month's percentages", () => {
  it("saving percentages in an unborn month makes it be born with the saved values", () => {
    const saved = save(emptyState(), "2026-10", pcts(40, 20, 15, 15, 5, 5));

    const view = projectMonth(saved, "2026-10");
    expect(view.budget).toEqual({ born: true, inheritedFrom: null });
    expect(percentagesOf(view)).toEqual([40, 20, 15, 15, 5, 5]);
  });

  it("editing October changes neither September nor an already born November", () => {
    const state: State = {
      ...emptyState(),
      budgets: {
        "2026-09": pcts(30, 25, 15, 15, 10, 5),
        "2026-10": pcts(30, 25, 15, 15, 10, 5),
        "2026-11": pcts(35, 20, 15, 15, 10, 5),
      },
    };

    const saved = save(state, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    expect(percentagesOf(projectMonth(saved, "2026-09"))).toEqual([30, 25, 15, 15, 10, 5]);
    expect(percentagesOf(projectMonth(saved, "2026-10"))).toEqual([40, 20, 15, 10, 10, 5]);
    expect(percentagesOf(projectMonth(saved, "2026-11"))).toEqual([35, 20, 15, 15, 10, 5]);
  });

  it("an unborn November starts showing October's percentages", () => {
    const state: State = {
      ...emptyState(),
      budgets: { "2026-09": pcts(30, 25, 15, 15, 10, 5), "2026-10": pcts(30, 25, 15, 15, 10, 5) },
    };

    const saved = save(state, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    const november = projectMonth(saved, "2026-11");
    expect(november.budget).toEqual({ born: false, inheritedFrom: "2026-10" });
    expect(percentagesOf(november)).toEqual([40, 20, 15, 10, 10, 5]);
  });

  it("applying does not change the received state", () => {
    const state: State = { ...emptyState(), budgets: { "2026-10": pcts(30, 25, 15, 15, 10, 5) } };

    save(state, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    expect(state.budgets["2026-10"]).toEqual(pcts(30, 25, 15, 15, 10, 5));
  });
});

describe("percentages validation", () => {
  it("a sum above 100 is rejected, saying by how much it went over", () => {
    const result = apply(emptyState(), savePercentages("2026-10", pcts(40, 25, 15, 15, 10, 5)), TODAY);

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/10 pontos/) });
  });

  it("a sum below 100 is accepted, and the rest is unallocated", () => {
    const saved = save(emptyState(), "2026-10", pcts(30, 20, 15, 15, 5, 5));

    expect(projectMonth(saved, "2026-10").unallocated.percentage).toBe(10);
  });

  it("a sum of exactly 100 is accepted, including with one jar at 100 and the others at 0", () => {
    expect(apply(emptyState(), savePercentages("2026-10", pcts(100, 0, 0, 0, 0, 0)), TODAY).ok).toBe(true);
  });

  it.each([
    ["negative percentage", pcts(-5, 25, 15, 15, 10, 5)],
    ["percentage above 100", pcts(101, 0, 0, 0, 0, 0)],
    ["fractional percentage", pcts(29.5, 25, 15, 15, 10, 5)],
    ["percentage that is not a number", pcts("30" as never, 25, 15, 15, 10, 5)],
    ["missing jar, in a malformed command", { ...pcts(30, 25, 15, 15, 10, 5), pleasures: undefined as never }],
  ])("%s is rejected", (_, percentages) => {
    expect(apply(emptyState(), savePercentages("2026-10", percentages), TODAY).ok).toBe(false);
  });

  it("a jar that is not one of the six is rejected", () => {
    const percentages = { ...pcts(30, 25, 15, 15, 10, 0), viagens: 5 } as Percentages;

    expect(apply(emptyState(), savePercentages("2026-10", percentages), TODAY).ok).toBe(false);
  });

  it.each(["2026-13", "2026-9", "outubro", ""])("malformed month %j is rejected", (month) => {
    expect(apply(emptyState(), savePercentages(month as Month, pcts(30, 25, 15, 15, 10, 5)), TODAY).ok).toBe(false);
  });

  it("a rejected command does not make the month be born", () => {
    const state = emptyState();

    apply(state, savePercentages("2026-10", pcts(50, 25, 15, 15, 10, 5)), TODAY);

    expect(projectMonth(state, "2026-10").budget.born).toBe(false);
  });
});

describe("projection with the percentages being typed", () => {
  const withIncome = (): State => ({
    ...emptyState(),
    budgets: { "2026-10": pcts(30, 25, 15, 15, 10, 5) },
    incomes: [{ id: 1, date: "2026-10-05", description: "Salário", source: "salary", paymentMethod: "transfer", amount: 1_000_000, deletedAt: null }],
  });

  it("recomputes limits and unallocated with the draft, without saving anything", () => {
    const state = withIncome();

    const view = projectMonth(state, "2026-10", pcts(40, 20, 15, 10, 5, 0));

    expect(percentagesOf(view)).toEqual([40, 20, 15, 10, 5, 0]);
    expect(view.jars.map((j) => j.limit)).toEqual([400_000, 200_000, 150_000, 100_000, 50_000, 0]);
    expect(view.unallocated).toEqual({ percentage: 10, amount: 100_000 });
    expect(projectMonth(state, "2026-10").jars.map((j) => j.percentage)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("the draft in an unborn month does not make it look born", () => {
    const view = projectMonth(emptyState(), "2026-11", pcts(40, 20, 15, 10, 5, 0));

    expect(view.budget).toEqual({ born: false, inheritedFrom: null });
    expect(percentagesOf(view)).toEqual([40, 20, 15, 10, 5, 0]);
  });

  it("a draft that goes over 100 leaves the unallocated at zero, never negative", () => {
    const view = projectMonth(withIncome(), "2026-10", pcts(50, 25, 15, 15, 10, 5));

    expect(view.unallocated).toEqual({ percentage: 0, amount: 0 });
  });
});

function savePercentages(month: Month, percentages: Percentages): Command {
  return { type: "save-percentages", month, percentages };
}

function save(state: State, month: Month, percentages: Percentages): State {
  const result = apply(state, savePercentages(month, percentages), TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function pcts(...values: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((j, i) => [j.id, values[i]])) as Percentages;
}

function percentagesOf(view: MonthView): number[] {
  return view.jars.map((j) => j.percentage);
}
