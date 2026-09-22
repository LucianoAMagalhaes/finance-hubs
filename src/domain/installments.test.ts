import { describe, expect, it } from "vitest";
import {
  apply,
  splitIntoInstallments,
  emptyState,
  groups,
  JARS,
  projectMonth,
  addMonths,
  PAYMENT_METHODS,
  allExpenses,
  lastDayOfMonth,
  type Command,
  type Purchase,
  type IsoDate,
  type Axis,
  type State,
  type ExpenseToSave,
  type Month,
  type NewExpense,
} from "@/domain";

const TODAY: IsoDate = "2026-09-18";

describe("installments of an installment purchase", () => {
  it("R$ 1.000 in 3× is 333,34 + 333,33 + 333,33 from the purchase month on, and nothing outside them", () => {
    const state = save(emptyState(), inInstallments({ date: "2026-09-12", amount: 100_000, installments: 3 }));

    expect(amountsByMonth(state, ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"])).toEqual([[], [33_334], [33_333], [33_333], []]);
  });

  it("the occurrence says which installment it is, of how many, and of what total", () => {
    const state = save(emptyState(), inInstallments({ date: "2026-06-18", amount: 389_900, installments: 10 }));

    const [occurrence] = projectMonth(state, "2026-09").occurrences;

    expect(occurrence).toMatchObject({ amount: 38_990, installment: { number: 4, of: 10, total: 389_900 } });
  });

  it("an upfront purchase is not an installment", () => {
    const state = save(emptyState(), inInstallments({ installments: 1 }));

    expect(projectMonth(state, "2026-09").occurrences[0]!.installment).toBeNull();
  });

  it("the installment falls on the purchase day, capped at the last day of the month", () => {
    const state = save(emptyState(), inInstallments({ date: "2026-01-31", installments: 3 }));

    expect(projectMonth(state, "2026-02").occurrences[0]!.date).toBe("2026-02-28");
    expect(projectMonth(state, "2026-03").occurrences[0]!.date).toBe("2026-03-31");
  });

  it("an installment purchase that started before the app, entered with the original date, only has the remaining ones from here on", () => {
    const state = save(emptyState(), inInstallments({ date: "2026-03-10", amount: 120_000, installments: 10 }));

    expect(projectMonth(state, "2026-09").occurrences[0]!.installment).toMatchObject({ number: 7 });
    expect(projectMonth(state, "2026-12").occurrences[0]!.installment).toMatchObject({ number: 10 });
    expect(projectMonth(state, "2027-01").occurrences).toEqual([]);
  });

  it("a refund in installments splits the negative total the same way", () => {
    const state = save(emptyState(), inInstallments({ amount: -100_000, installments: 3 }));

    expect(amountsByMonth(state, ["2026-09", "2026-10", "2026-11"])).toEqual([[-33_334], [-33_333], [-33_333]]);
  });

  it("the installments always add up to the total, and the leftover cent goes on the first", () => {
    for (const [total, n] of [[100_000, 3], [1, 2], [-1, 2], [99_999, 7], [-389_900, 10], [5, 12], [42_000, 1]] as const) {
      const { first, rest } = splitIntoInstallments(total, n);
      expect(first + rest * (n - 1), `${total} in ${n}×`).toBe(total);
      expect(Math.sign(first)).toBe(Math.sign(total));
      expect(Math.abs(first - rest)).toBeLessThan(n);
    }
  });
});

describe("installment purchase validation", () => {
  it.each(PAYMENT_METHODS.filter((m) => m.id !== "credit-card").map((m) => m.id))(
    "more than one installment on %s is rejected",
    (method) => {
      expect(apply(emptyState(), saveExpense(inInstallments({ paymentMethod: method, installments: 3 })), TODAY)).toEqual({
        ok: false,
        error: expect.stringMatching(/Cartão de Crédito/),
      });
    },
  );

  it.each([
    ["zero installments", 0],
    ["negative installments", -2],
    ["fractional installments", 2.5],
    ["installments that are not a number", "3" as never],
  ])("%s is rejected", (_, installments) => {
    expect(apply(emptyState(), saveExpense(inInstallments({ installments })), TODAY).ok).toBe(false);
  });
});

describe("correcting an installment purchase", () => {
  it("correcting the total changes every installment, including those of past months", () => {
    const state = save(emptyState(), inInstallments({ date: "2026-07-05", amount: 90_000, installments: 3 }));
    const id = projectMonth(state, "2026-07").occurrences[0]!.expense;

    const corrected = save(state, { ...inInstallments({ date: "2026-07-05", amount: 120_000, installments: 3 }), id });

    expect(amountsByMonth(corrected, ["2026-07", "2026-08", "2026-09"])).toEqual([[40_000], [40_000], [40_000]]);
  });

  it("switching to upfront leaves a single occurrence, with the total, in the purchase month", () => {
    const state = save(emptyState(), inInstallments({ date: "2026-07-05", amount: 90_000, installments: 3 }));
    const id = projectMonth(state, "2026-07").occurrences[0]!.expense;

    const upfront = save(state, { ...inInstallments({ date: "2026-07-05", amount: 90_000, installments: 1 }), id });

    expect(amountsByMonth(upfront, ["2026-07", "2026-08", "2026-09"])).toEqual([[90_000], [], []]);
  });

  it("switching from upfront to installments spreads the total over the months", () => {
    const state = save(emptyState(), inInstallments({ amount: 60_000, installments: 1 }));
    const id = projectMonth(state, "2026-09").occurrences[0]!.expense;

    const split = save(state, { ...inInstallments({ amount: 60_000, installments: 2 }), id });

    expect(amountsByMonth(split, ["2026-09", "2026-10"])).toEqual([[30_000], [30_000]]);
  });
});

describe("month birth with an installment purchase", () => {
  it("only the purchase month is born: the 4th installment falling in December does not make December be born", () => {
    const state = save(emptyState(), inInstallments({ date: "2026-09-12", installments: 4 }));

    expect(projectMonth(state, "2026-09").budget.born).toBe(true);
    for (const month of ["2026-10", "2026-11", "2026-12"] as const) {
      expect(projectMonth(state, month).occurrences, month).toHaveLength(1);
      expect(projectMonth(state, month).budget.born, month).toBe(false);
    }
  });
});

describe("axes invariant with installment purchases (property)", () => {
  const AXES: Axis[] = ["jar", "payment-method", "tag"];
  const MONTHS: Month[] = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("state generated with seed %i", (seed) => {
    const state = generatedState(seed);

    for (const month of MONTHS) {
      const view = projectMonth(state, month);
      expect(view.jars.reduce((s, j) => s + j.total, 0)).toBe(view.aggregates.monthExpenses);
      for (const axis of AXES) {
        const gs = groups(view, axis);
        expect(gs.reduce((s, g) => s + g.total, 0), `axis ${axis} in ${month}`).toBe(view.aggregates.monthExpenses);
        expect(new Set(gs.flatMap((g) => g.occurrences))).toEqual(new Set(view.occurrences));
        expect(gs.flatMap((g) => g.occurrences)).toHaveLength(view.occurrences.length);
      }
      expect(allExpenses(view).total).toBe(view.aggregates.monthExpenses);
    }
    // Summed over every month, each purchase's installments give its total.
    for (const e of state.expenses) {
      // The last possible installment: 12× starting in December falls in November of the next year.
      const sum = Array.from({ length: 17 }, (_, i) => addMonths("2026-07", i))
        .flatMap((m) => projectMonth(state, m).occurrences)
        .filter((o) => o.expense === e.id)
        .reduce((s, o) => s + o.amount, 0);
      expect(sum).toBe((e as Purchase).amount);
    }
  });

  /** Upfront and installment purchases, refunds and changes of form, spread over months. */
  function generatedState(seed: number): State {
    const random = generator(seed);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const date = (): IsoDate => {
      const month = pick(MONTHS);
      return `${month}-${String(1 + Math.floor(random() * lastDayOfMonth(month))).padStart(2, "0")}` as IsoDate;
    };
    let state = emptyState();
    for (let i = Math.floor(random() * 20); i > 0; i--) {
      const amount = 1 + Math.floor(random() * 500_000);
      const installments = random() < 0.5 ? 1 : 2 + Math.floor(random() * 11);
      const correct = state.expenses.length > 0 && random() < 0.2;
      const data = inInstallments({
        ...(correct && { id: pick(state.expenses).id }),
        date: date(),
        jar: pick(JARS).id,
        paymentMethod: installments > 1 ? "credit-card" : pick(PAYMENT_METHODS).id,
        amount: random() < 0.25 ? -amount : amount,
        installments,
        tag: random() < 0.4 ? null : pick(["transporte", "casa", "#Saúde"]),
      });
      state = save(state, data);
    }
    return state;
  }
});

/** mulberry32: reproducible, so a seed that fails always fails. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function amountsByMonth(state: State, months: Month[]): number[][] {
  return months.map((m) => projectMonth(state, m).occurrences.map((o) => o.amount));
}

function inInstallments(fields: Partial<NewExpense> & { id?: number }): ExpenseToSave {
  return {
    date: "2026-09-12",
    description: "Notebook",
    jar: "comfort",
    paymentMethod: "credit-card",
    amount: 100_000,
    installments: 3,
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
