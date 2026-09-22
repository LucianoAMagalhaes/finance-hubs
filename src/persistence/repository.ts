import { eq } from "drizzle-orm";
import type { Prepayment, Purchase, Income, State, Expense, Month, Percentages, Recurring, Period } from "@/domain";
import type { Database, Connection } from "./database";
import { prepayment, income, expense, monthBudget, recurring, period } from "./schema";

// No business rule here: validating and deriving belong to the domain. This
// module only translates the state into rows and back.

type BudgetRow = typeof monthBudget.$inferSelect;
type IncomeRow = typeof income.$inferSelect;
type ExpenseRow = typeof expense.$inferSelect;
type RecurringRow = typeof recurring.$inferSelect;
type PeriodRow = typeof period.$inferSelect;
type PrepaymentRow = typeof prepayment.$inferSelect;

function toPercentages(row: BudgetRow): Percentages {
  return {
    "fixed-costs": row.fixedCosts,
    "financial-freedom": row.financialFreedom,
    comfort: row.comfort,
    goals: row.goals,
    knowledge: row.knowledge,
    pleasures: row.pleasures,
  };
}

function toBudgetRow(month: Month, p: Percentages): BudgetRow {
  return {
    month,
    fixedCosts: p["fixed-costs"],
    financialFreedom: p["financial-freedom"],
    comfort: p.comfort,
    goals: p.goals,
    knowledge: p.knowledge,
    pleasures: p.pleasures,
  };
}

function toIncome(row: IncomeRow): Income {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    source: row.source,
    paymentMethod: row.paymentMethod,
    amount: row.amount,
    deletedAt: row.deletedAt,
  } as Income;
}

function toIncomeRow(i: Income): IncomeRow {
  return {
    id: i.id,
    date: i.date,
    description: i.description,
    source: i.source,
    paymentMethod: i.paymentMethod,
    amount: i.amount,
    deletedAt: i.deletedAt,
  };
}

/** The prepayments come in id order: the order of application is derived by the domain. */
function toPurchase(row: ExpenseRow, prepayments: PrepaymentRow[]): Purchase {
  return {
    id: row.id,
    kind: "purchase",
    date: row.date,
    description: row.description,
    jar: row.jar,
    paymentMethod: row.paymentMethod,
    amount: row.amount,
    installments: row.installments,
    tag: row.tag,
    prepayments: prepayments.map(
      (p) => ({ id: p.id, date: p.date, installments: p.installments, amount: p.amount, deletedAt: p.deletedAt }) as Prepayment,
    ),
    deletedAt: row.deletedAt,
  } as Purchase;
}

function toPurchaseRow(p: Purchase): ExpenseRow {
  return {
    id: p.id,
    date: p.date,
    description: p.description,
    jar: p.jar,
    paymentMethod: p.paymentMethod,
    amount: p.amount,
    installments: p.installments,
    tag: p.tag,
    deletedAt: p.deletedAt,
  };
}

function toPrepaymentRow(id: number, p: Prepayment): PrepaymentRow {
  return { id: p.id, expense: id, date: p.date, installments: p.installments, amount: p.amount, deletedAt: p.deletedAt };
}

/** The periods come in start order: "YYYY-MM" sorts like time. */
function toRecurring(row: RecurringRow, periods: PeriodRow[]): Recurring {
  return {
    id: row.id,
    kind: "recurring",
    day: row.day,
    periods: periods.map(
      (p) =>
        ({
          since: p.since,
          description: p.description,
          jar: p.jar,
          paymentMethod: p.paymentMethod,
          amount: p.amount,
          tag: p.tag,
        }) as Period,
    ),
    endedIn: row.endedIn,
    deletedAt: row.deletedAt,
  } as Recurring;
}

function toRecurringRow({ id, day, endedIn, deletedAt }: Recurring): RecurringRow {
  return { id, day, endedIn, deletedAt };
}

function toPeriodRow(id: number, p: Period): PeriodRow {
  return {
    recurring: id,
    since: p.since,
    description: p.description,
    jar: p.jar,
    paymentMethod: p.paymentMethod,
    amount: p.amount,
    tag: p.tag,
  };
}

export const loadState = ({ db }: Database): State => load(db);

export function load(db: Connection): State {
  const budgets: State["budgets"] = {};
  for (const row of db.select().from(monthBudget).all()) {
    budgets[row.month as Month] = toPercentages(row);
  }
  const incomes = db.select().from(income).orderBy(income.id).all().map(toIncome);
  const periods = db.select().from(period).orderBy(period.recurring, period.since).all();
  const prepayments = db.select().from(prepayment).orderBy(prepayment.id).all();
  const expenses: Expense[] = [
    ...db
      .select()
      .from(expense)
      .all()
      .map((e) => toPurchase(e, prepayments.filter((p) => p.expense === e.id))),
    ...db
      .select()
      .from(recurring)
      .all()
      .map((r) => toRecurring(r, periods.filter((p) => p.recurring === r.id))),
  ].sort((a, b) => a.id - b.id);
  return { budgets, incomes, expenses };
}

/**
 * Saves the state the commands returned, inside the caller's transaction.
 * Almost nothing is deleted (budget never, the rest goes to the trash as a
 * mark), so rows are only inserted or replaced. The exception is the periods,
 * which are rewritten per recurring expense: the one discarded on ending goes away.
 */
export function save(tx: Connection, state: State): void {
  for (const [month, percentages] of Object.entries(state.budgets)) {
    if (!percentages) continue;
    const row = toBudgetRow(month as Month, percentages);
    tx.insert(monthBudget)
      .values(row)
      .onConflictDoUpdate({ target: monthBudget.month, set: row })
      .run();
  }
  for (const i of state.incomes) {
    const row = toIncomeRow(i);
    tx.insert(income).values(row).onConflictDoUpdate({ target: income.id, set: row }).run();
  }
  for (const e of state.expenses) {
    if (e.kind === "purchase") {
      const row = toPurchaseRow(e);
      tx.insert(expense).values(row).onConflictDoUpdate({ target: expense.id, set: row }).run();
      for (const p of e.prepayments) {
        const prepaymentRow = toPrepaymentRow(e.id, p);
        tx.insert(prepayment)
          .values(prepaymentRow)
          .onConflictDoUpdate({ target: prepayment.id, set: prepaymentRow })
          .run();
      }
      continue;
    }
    const row = toRecurringRow(e);
    tx.insert(recurring).values(row).onConflictDoUpdate({ target: recurring.id, set: row }).run();
    tx.delete(period).where(eq(period.recurring, e.id)).run();
    tx.insert(period).values(e.periods.map((p) => toPeriodRow(e.id, p))).run();
  }
}
