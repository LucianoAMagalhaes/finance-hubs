import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The portfolio's tables, in the same SQLite file as the budget's and with no
// relation to them (CONTEXT-MAP.md).

/**
 * The target of each of the five classes: one row per class, created by the
 * migration with the default targets and only ever rewritten.
 */
export const classTarget = sqliteTable("class_target", {
  /** The class's id, as the domain names it ("domestic-stocks"). */
  assetClass: text("asset_class").primaryKey(),
  /** An integer from 0 to 100; the five add up to 100. */
  target: integer("target").notNull(),
});

/** An asset, by its ticker and class. */
export const asset = sqliteTable("asset", {
  id: integer("id").primaryKey(),
  /** Unique in the portfolio; can be corrected, keeping the history. */
  ticker: text("ticker").notNull().unique(),
  /** The class's id, as the domain names it; never changes. */
  assetClass: text("asset_class").notNull(),
});

/**
 * A buy or a sale of an asset. Quantity and unit price are exact decimals,
 * stored as integers scaled to 8 places. The id is also the order of entry.
 * Deleted for good: there is no trash mark.
 */
export const trade = sqliteTable("trade", {
  id: integer("id").primaryKey(),
  asset: integer("asset")
    .notNull()
    .references(() => asset.id),
  /** "buy" or "sell". */
  kind: text("kind").notNull(),
  date: text("date").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
});

/**
 * Money an asset paid, on its payment date: the amount received in reais, net,
 * in cents. Deleted for good: there is no trash mark.
 */
export const payout = sqliteTable("payout", {
  id: integer("id").primaryKey(),
  asset: integer("asset")
    .notNull()
    .references(() => asset.id),
  /** The payment date. */
  date: text("date").notNull(),
  /** "dividend", "interest-on-equity", "fund-income" or "interest"; only informative. */
  kind: text("kind").notNull(),
  amount: integer("amount").notNull(),
});

/**
 * The last quote of an asset, one row per asset that ever had one, rewritten
 * by each fetch. The price is an exact decimal, scaled to 8 places.
 */
export const quote = sqliteTable("quote", {
  asset: integer("asset")
    .primaryKey()
    .references(() => asset.id),
  price: integer("price").notNull(),
  /** When it was obtained, "YYYY-MM-DDTHH:MM:SS" on the machine's clock. */
  at: text("at").notNull(),
});

/** The time of the last successful fetch of each kind, one row per kind ever fetched. */
export const lastFetch = sqliteTable("last_fetch", {
  /** "quotes". */
  kind: text("kind").primaryKey(),
  at: text("at").notNull(),
});
