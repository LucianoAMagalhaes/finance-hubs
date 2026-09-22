import type { Income } from "./incomes";
import { purchases, type State } from "./state";
import type { Prepayment, Purchase, Expense } from "./expenses";
import type { IsoDate } from "./month";

/** The three records the person creates, and therefore deletes and restores. */
export type RecordType = "income" | "expense" | "prepayment";

export function isRecordType(record: unknown): record is RecordType {
  return record === "income" || record === "expense" || record === "prepayment";
}

export type TrashItem = { id: number; deletedAt: IsoDate } & (
  | { record: "income"; income: Income }
  | { record: "expense"; expense: Expense }
  /** The undone prepayment, along with the installment purchase it belongs to: on its own, it doesn't explain itself. */
  | { record: "prepayment"; prepayment: Prepayment; purchase: Purchase }
);

/** The records outside the trash: only they generate income and occurrences. */
export function live<T extends { deletedAt: IsoDate | null }>(records: T[]): T[] {
  return records.filter((r) => r.deletedAt === null);
}

/**
 * What is in the trash, most recently deleted first; on the same day, the
 * one with the higher id. An installment purchase in the trash takes its prepayments
 * along: they come back with it, and don't show up as loose items.
 */
export function trashItems(state: State): TrashItem[] {
  const items: TrashItem[] = [
    ...state.incomes.flatMap((income) =>
      income.deletedAt ? [{ record: "income" as const, id: income.id, deletedAt: income.deletedAt, income }] : [],
    ),
    ...state.expenses.flatMap((expense) =>
      expense.deletedAt ? [{ record: "expense" as const, id: expense.id, deletedAt: expense.deletedAt, expense }] : [],
    ),
    ...purchases(state).flatMap((purchase) =>
      purchase.deletedAt
        ? []
        : purchase.prepayments.flatMap((prepayment) =>
            prepayment.deletedAt
              ? [{ record: "prepayment" as const, id: prepayment.id, deletedAt: prepayment.deletedAt, prepayment, purchase }]
              : [],
          ),
    ),
  ];
  return items.sort((a, b) => (a.deletedAt === b.deletedAt ? b.id - a.id : a.deletedAt < b.deletedAt ? 1 : -1));
}
