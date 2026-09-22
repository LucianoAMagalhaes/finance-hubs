import type { Income } from "./incomes";
import type { Prepayment, Purchase, Expense } from "./expenses";
import type { Month } from "./month";
import type { Percentages } from "./jars";

/**
 * Everything that is stored. What is derived (occurrence, limit, income, aggregates)
 * never goes in here (ADR-0001, ADR-0002).
 */
export type State = {
  /** The budget of every month already born. One row per month, never deleted. */
  budgets: Partial<Record<Month, Percentages>>;
  incomes: Income[];
  expenses: Expense[];
};

export function emptyState(): State {
  return { budgets: {}, incomes: [], expenses: [] };
}

/** The state's purchases, live or not: that's where the prepayments live. */
export const purchases = (state: State): Purchase[] => state.expenses.filter((e) => e.kind === "purchase");

/** The prepayment with id `id`, along with the installment purchase it belongs to; null when it doesn't exist. */
export function findPrepayment(state: State, id: number): { purchase: Purchase; prepayment: Prepayment } | null {
  for (const purchase of purchases(state)) {
    const prepayment = purchase.prepayments.find((p) => p.id === id);
    if (prepayment) return { purchase, prepayment };
  }
  return null;
}
