import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The month budget (ADR-0001): one row per born month, never deleted. */
export const monthBudget = sqliteTable("month_budget", {
  /** "YYYY-MM" */
  month: text("month").primaryKey(),
  fixedCosts: integer("fixed_costs").notNull(),
  financialFreedom: integer("financial_freedom").notNull(),
  comfort: integer("comfort").notNull(),
  goals: integer("goals").notNull(),
  knowledge: integer("knowledge").notNull(),
  pleasures: integer("pleasures").notNull(),
});

/** Money coming in (ADR-0003). Never deleted for good: the trash is a mark. */
export const income = sqliteTable("income", {
  id: integer("id").primaryKey(),
  /** "YYYY-MM-DD" */
  date: text("date").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  paymentMethod: text("payment_method").notNull(),
  /** Integer cents, always positive. */
  amount: integer("amount").notNull(),
  /** The trash mark: "YYYY-MM-DD" of the day it was deleted; null while it is live. */
  deletedAt: text("deleted_at"),
});

/**
 * An expense in the purchase form, one-off or in installments (ADR-0003). Stores
 * the total; the occurrences are derived (ADR-0002). Never deleted for good: the
 * trash is a mark. Shares the numbering with `recurring`: the domain gives the id.
 */
export const expense = sqliteTable("expense", {
  id: integer("id").primaryKey(),
  /** "YYYY-MM-DD" */
  date: text("date").notNull(),
  description: text("description").notNull(),
  jar: text("jar").notNull(),
  paymentMethod: text("payment_method").notNull(),
  /** Integer cents of the total; negative when it is a refund. */
  amount: integer("amount").notNull(),
  /** 1 is one-off. */
  installments: integer("installments").notNull(),
  /** Already normalized by the domain; null is no tag. */
  tag: text("tag"),
  /** The trash mark: "YYYY-MM-DD" of the day it was deleted; null while it is live. */
  deletedAt: text("deleted_at"),
});

/**
 * The prepayment of the last installments of an installment purchase (ADR-0005).
 * Has no jar, method or tag: it inherits the purchase's. Never deleted for good:
 * the trash is a mark, and deleting the purchase doesn't delete the row.
 */
export const prepayment = sqliteTable("prepayment", {
  id: integer("id").primaryKey(),
  expense: integer("expense")
    .notNull()
    .references(() => expense.id),
  /** "YYYY-MM-DD" of the payment; its month is the one that gets the occurrence. */
  date: text("date").notNull(),
  /** How many installments it takes, from the last one backwards. */
  installments: integer("installments").notNull(),
  /** Integer cents of the amount paid, always positive. */
  amount: integer("amount").notNull(),
  /** The trash mark: "YYYY-MM-DD" of the day it was undone; null while it holds. */
  deletedAt: text("deleted_at"),
});

/**
 * An expense in the recurring form. What changes over time is in its periods.
 * Shares the numbering with `expense`: the domain gives the id.
 */
export const recurring = sqliteTable("recurring", {
  id: integer("id").primaryKey(),
  /** The day of the month it falls on, 1 to 31. */
  day: integer("day").notNull(),
  /** "YYYY-MM" of the first month it no longer falls in; null is no end. */
  endedIn: text("ended_in"),
  /** The trash mark: "YYYY-MM-DD" of the day it was deleted; null while it is live. */
  deletedAt: text("deleted_at"),
});

/**
 * A period of a recurring expense, holding from `since` until the next one. The
 * period discarded on ending is deleted for good: it doesn't go to the trash.
 */
export const period = sqliteTable(
  "period",
  {
    recurring: integer("recurring")
      .notNull()
      .references(() => recurring.id),
    /** "YYYY-MM" */
    since: text("since").notNull(),
    description: text("description").notNull(),
    jar: text("jar").notNull(),
    paymentMethod: text("payment_method").notNull(),
    /** Integer cents, never zero; negative when it is a refund. */
    amount: integer("amount").notNull(),
    /** Already normalized by the domain; null is no tag. */
    tag: text("tag"),
  },
  (t) => [primaryKey({ columns: [t.recurring, t.since] })],
);
