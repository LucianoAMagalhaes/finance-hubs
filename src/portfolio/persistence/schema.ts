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
