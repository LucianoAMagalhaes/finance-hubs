import type { Cents } from "./money";
import type { Income } from "./incomes";
import type { State } from "./state";
import { occurrencesIn, type Occurrence } from "./expenses";
import { live } from "./trash";
import { monthOf, type Month } from "./month";
import { DEFAULT_PERCENTAGES, JARS, sumPercentages, type Percentages, type Jar } from "./jars";

export type BudgetInView = {
  /** Whether the month already has its own stored budget. Before it is born, it only shows what it would inherit. */
  born: boolean;
  /** Which month an unborn month's percentages would come from; null when they would be the defaults. */
  inheritedFrom: Month | null;
};

export type Verdict = "overrun" | "leftover" | "no-income";

export type JarInView = {
  id: Jar;
  name: string;
  percentage: number;
  /** Net sum of the jar's occurrences in the month. */
  total: Cents;
  /** `percentage × income`, exact (may have a fraction of a cent); null when the month has no income. */
  limit: number | null;
  verdict: Verdict;
  /** How much the total goes over the exact limit; 0 when it fits, null when the month has no income. */
  overrun: number | null;
};

export type MonthAggregates = {
  monthIncome: Cents;
  monthExpenses: Cents;
  monthBalance: Cents;
  accountBalance: Cents;
};

export type Unallocated = {
  /** Percentage points of the income no jar claims. */
  percentage: number;
  /** In reais, exact like the limit; null when the month has no income. */
  amount: number | null;
};

export type MonthView = {
  month: Month;
  budget: BudgetInView;
  /** Sum of the month's incomes. */
  monthIncome: Cents;
  jars: JarInView[];
  unallocated: Unallocated;
  aggregates: MonthAggregates;
  /** The incomes dated in the month, in date order. */
  incomes: Income[];
  /** The occurrences of the expenses in the month, in date order. */
  occurrences: Occurrence[];
};

/**
 * Everything the month screen shows, derived from the state. Reading never makes a month be born.
 * What is in the trash generates neither income nor occurrences.
 * `editingPercentages` are the ones the person is typing: the view is
 * recalculated with them, without anything being stored, and the month stays born or not.
 */
export function projectMonth(state: State, month: Month, editingPercentages?: Percentages): MonthView {
  const { percentages: effective, ...budget } = effectivePercentages(state, month);
  const percentages = editingPercentages ?? effective;
  const incomes = inDateOrder(
    live(state.incomes).filter((i) => monthOf(i.date) === month),
    (i) => i.id,
  );
  const occurrences = inDateOrder(
    live(state.expenses).flatMap((e) => occurrencesIn(e, month)),
    (o) => o.expense,
  );
  const monthIncome = sum(incomes);
  // Without income, there is no limit: a month whose income isn't known yet doesn't overrun.
  const limitOf = (percentage: number) => (monthIncome > 0 ? (percentage * monthIncome) / 100 : null);
  const monthExpenses = sum(occurrences);
  const offCard = sum(occurrences.filter((o) => o.paymentMethod !== "credit-card"));
  // Percentages being edited may go over 100; the unallocated is never negative.
  const unallocated = Math.max(0, 100 - sumPercentages(percentages));
  return {
    month,
    budget,
    monthIncome,
    jars: JARS.map((j) => {
      const total = sum(occurrences.filter((o) => o.jar === j.id));
      const limit = limitOf(percentages[j.id]);
      // The overrun compares against the exact limit; only the display rounds.
      const overrun = limit === null ? null : Math.max(0, total - limit);
      return {
        id: j.id,
        name: j.name,
        percentage: percentages[j.id],
        total,
        limit,
        verdict: overrun === null ? "no-income" : overrun > 0 ? "overrun" : "leftover",
        overrun,
      };
    }),
    unallocated: { percentage: unallocated, amount: limitOf(unallocated) },
    aggregates: {
      monthIncome,
      monthExpenses,
      monthBalance: monthIncome - monthExpenses,
      accountBalance: monthIncome - offCard,
    },
    incomes,
    occurrences,
  };
}

const sum = (records: { amount: Cents }[]): Cents => records.reduce((total, r) => total + r.amount, 0);

/** In date order; on the same day, in the order they were entered. */
function inDateOrder<T extends { date: string }>(records: T[], idOf: (r: T) => number): T[] {
  return records.sort((a, b) => (a.date === b.date ? idOf(a) - idOf(b) : a.date < b.date ? -1 : 1));
}

function effectivePercentages(state: State, month: Month): BudgetInView & { percentages: Percentages } {
  const own = state.budgets[month];
  if (own) return { percentages: own, born: true, inheritedFrom: null };
  const { percentages, from } = wouldInherit(state, month);
  return { percentages, born: false, inheritedFrom: from };
}

/**
 * What a month would get when born: the percentages of the most recent earlier month
 * that already has a budget, or the defaults if there is none (ADR-0001).
 */
export function wouldInherit(state: State, month: Month): { percentages: Percentages; from: Month | null } {
  const earlier = (Object.keys(state.budgets) as Month[]).filter((m) => m < month).sort();
  const from = earlier.at(-1);
  const percentages = from && state.budgets[from];
  return percentages ? { percentages, from } : { percentages: DEFAULT_PERCENTAGES, from: null };
}
