import { incomeSourceName, type Income } from "./incomes";
import { jarName } from "./jars";
import type { Cents, IsoDate } from "@/shared";
import { purchases, type State } from "./state";
import { startOf, type Prepayment, type Purchase, type Expense } from "./expenses";
import { monthName, monthOf } from "./month";

/** The three records the person creates, and therefore deletes and restores. */
export type RecordType = "income" | "expense" | "prepayment";

export function isRecordType(record: unknown): record is RecordType {
  return record === "income" || record === "expense" || record === "prepayment";
}

/**
 * Something in the trash, already said: whoever shows it doesn't need to know the
 * shape of the record behind it, only how to draw a line.
 */
export type TrashItem = {
  record: RecordType;
  id: number;
  deletedAt: IsoDate;
  description: string;
  /** What it is worth; for a recurring expense, what its last period is worth. */
  amount: Cents;
  /** What it is and where it lands when it comes back, in segments, in the order they read. */
  where: string[];
};

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
    ...state.incomes.flatMap((income) => (income.deletedAt ? [fromIncome(income, income.deletedAt)] : [])),
    ...state.expenses.flatMap((expense) => (expense.deletedAt ? [fromExpense(expense, expense.deletedAt)] : [])),
    ...purchases(state).flatMap((purchase) =>
      purchase.deletedAt
        ? []
        : purchase.prepayments.flatMap((p) => (p.deletedAt ? [fromPrepayment(p, purchase, p.deletedAt)] : [])),
    ),
  ];
  return items.sort((a, b) => (a.deletedAt === b.deletedAt ? b.id - a.id : a.deletedAt < b.deletedAt ? 1 : -1));
}

function fromIncome(income: Income, deletedAt: IsoDate): TrashItem {
  return {
    record: "income",
    id: income.id,
    deletedAt,
    description: income.description,
    amount: income.amount,
    where: ["Entrada", incomeSourceName(income.source), monthName(monthOf(income.date))],
  };
}

function fromExpense(expense: Expense, deletedAt: IsoDate): TrashItem {
  // What the expense shows: the purchase, or the recurring expense's last period.
  const fields = expense.kind === "purchase" ? expense : expense.periods.at(-1)!;
  return {
    record: "expense",
    id: expense.id,
    deletedAt,
    description: fields.description,
    amount: fields.amount,
    where: ["Gasto", jarName(fields.jar), shapeOf(expense)],
  };
}

/** How the expense falls across the months, which is where it lands when it comes back. */
function shapeOf(expense: Expense): string {
  if (expense.kind === "recurring") {
    const ended = expense.endedIn ? `, encerrado em ${monthName(expense.endedIn)}` : "";
    return `recorrente desde ${monthName(startOf(expense))}${ended}`;
  }
  const month = monthName(monthOf(expense.date));
  return expense.installments > 1 ? `${expense.installments}× a partir de ${month}` : month;
}

/**
 * A prepayment doesn't explain itself: it is shown by the installment purchase it
 * belongs to. Restoring revalidates against that purchase as it stands, so it cuts
 * whatever installments are still left, not the ones it cut before.
 */
function fromPrepayment(prepayment: Prepayment, purchase: Purchase, deletedAt: IsoDate): TrashItem {
  const howMany = prepayment.installments === 1 ? "1 parcela" : `${prepayment.installments} parcelas`;
  return {
    record: "prepayment",
    id: prepayment.id,
    deletedAt,
    description: purchase.description,
    amount: prepayment.amount,
    where: [`Antecipação de ${howMany}`, monthName(monthOf(prepayment.date)), "volta a cortar as últimas que sobrarem"],
  };
}
