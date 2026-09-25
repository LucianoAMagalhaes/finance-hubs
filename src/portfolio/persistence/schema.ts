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
