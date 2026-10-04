import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

/**
 * An asset, by its ticker and class, and its id at the source. A fixed-income
 * asset also has its bond's columns, null in every other class.
 */
export const asset = sqliteTable("asset", {
  id: integer("id").primaryKey(),
  /** Unique in the portfolio; can be corrected, keeping the history. A bond's name, as typed. */
  ticker: text("ticker").notNull().unique(),
  /** The class's id, as the domain names it; never changes. */
  assetClass: text("asset_class").notNull(),
  /** How the source knows it: the ISIN in the B3's classes, the CoinGecko id in crypto; null when no source said. */
  sourceId: text("source_id"),
  /** "treasury-bond" or "private-bond"; never changes. */
  bondKind: text("bond_kind"),
  /** "cdb", "lci", "lca" or "debenture"; only informative. */
  bondType: text("bond_type"),
  /** "cdi-percentage", "fixed-rate" or "ipca-plus". */
  indexer: text("indexer"),
  /** In percent, an exact decimal scaled to 8 places: 110% of the CDI is 110. */
  rate: integer("rate"),
  maturityDate: text("maturity_date"),
});

/**
 * A buy or a sale of an asset. Quantity and unit price are exact decimals,
 * stored as integers scaled to 8 places; the exchange rate, as an integer
 * scaled to 4. A private bond's trade has the amount in reais instead, and
 * neither quantity nor unit price: the domain says which. The id is also the
 * order of entry. Deleted for good: there is no trash mark.
 */
export const trade = sqliteTable("trade", {
  id: integer("id").primaryKey(),
  asset: integer("asset")
    .notNull()
    .references(() => asset.id),
  /** "buy" or "sell". */
  kind: text("kind").notNull(),
  date: text("date").notNull(),
  quantity: integer("quantity"),
  unitPrice: integer("unit_price"),
  /** Reais per dollar, scaled to 4 places, in a trade in dollars; null in reais. */
  exchangeRate: integer("exchange_rate"),
  /** A private bond's trade, in cents; null in any other asset. */
  amount: integer("amount"),
  /** Whether a private bond's redemption takes every share, at the amount received. */
  redeemsAll: integer("redeems_all", { mode: "boolean" }).notNull().default(false),
});

/**
 * A split, reverse split or bonus of an asset, on its date. The quantity
 * becomes `quantity × ratio_to ÷ ratio_from` once confirmed. Deleted for good,
 * and with its asset: there is no trash mark.
 */
export const corporateAction = sqliteTable("corporate_action", {
  id: integer("id").primaryKey(),
  asset: integer("asset")
    .notNull()
    .references(() => asset.id),
  /** "split", "reverse-split" or "bonus"; only informative. */
  kind: text("kind").notNull(),
  date: text("date").notNull(),
  /** The ratio as the company announces it: "1 para 4" is 1 → 4, "1 nova para cada 10" is 10 → 11. */
  ratioFrom: integer("ratio_from").notNull(),
  ratioTo: integer("ratio_to").notNull(),
  /** "pending", "confirmed" or "dismissed"; a dismissed one stays so the source never proposes it again. */
  status: text("status").notNull().default("confirmed"),
  /** The source's proposal it came from ("2026-03-10 1:4"); null on one entered by hand. */
  origin: text("origin"),
});

/**
 * The origin of a payout the source brought: its asset, kind, record date and
 * payment date. Kept after the payout is corrected or deleted, so the source
 * never writes it again; deleted only with its asset.
 */
export const payoutOrigin = sqliteTable("payout_origin", {
  id: integer("id").primaryKey(),
  asset: integer("asset")
    .notNull()
    .references(() => asset.id),
  kind: text("kind").notNull(),
  recordDate: text("record_date").notNull(),
  paymentDate: text("payment_date").notNull(),
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
  /** The origin it came from, on a payout the source brought; null on one entered by hand. */
  origin: integer("origin").references(() => payoutOrigin.id),
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

/**
 * The current exchange rate, a single row that exists once a fetch brought one
 * and is rewritten by each fetch. Reais per dollar, scaled to 4 places.
 */
export const currentExchangeRate = sqliteTable("current_exchange_rate", {
  /** Always 1: there is only the last rate. */
  id: integer("id").primaryKey(),
  rate: integer("rate").notNull(),
  /** When it was obtained, "YYYY-MM-DDTHH:MM:SS" on the machine's clock. */
  at: text("at").notNull(),
});

/** The time of the last successful fetch of each kind, one row per kind ever fetched. */
export const lastFetch = sqliteTable("last_fetch", {
  /** "quotes", "payouts", "corporate-actions" or "rate-indexes". */
  kind: text("kind").primaryKey(),
  at: text("at").notNull(),
});

/** Daily CDI and monthly IPCA or projections, in percent scaled to 8 places. */
export const rateIndex = sqliteTable("rate_index", {
  kind: text("kind").notNull(),
  date: text("date").notNull(),
  rate: integer("rate").notNull(),
}, (t) => [primaryKey({ columns: [t.kind, t.date] })]);

/** Current manual score, removed when its asset is deleted. */
export const manualScore = sqliteTable("manual_score", {
  asset: integer("asset").primaryKey().references(() => asset.id),
  score: integer("score").notNull(),
  evaluatedAt: text("evaluated_at").notNull(),
});

/** The two questionnaires, shared by the stock classes and specific to funds. */
export const questionnaire = sqliteTable("questionnaire", {
  id: text("id").primaryKey(),
});

export const question = sqliteTable("question", {
  id: integer("id").primaryKey(),
  questionnaire: text("questionnaire").notNull().references(() => questionnaire.id),
  position: integer("position").notNull(),
  text: text("text").notNull(),
});

/** Only the current answer for each asset and question. */
export const answer = sqliteTable("answer", {
  asset: integer("asset").notNull().references(() => asset.id),
  question: integer("question").notNull().references(() => question.id),
  value: integer("value", { mode: "boolean" }).notNull(),
}, t => [primaryKey({ columns: [t.asset, t.question] })]);

/** Kept apart from answers so questionnaire edits cannot change the evaluation date. */
export const questionnaireEvaluation = sqliteTable("questionnaire_evaluation", {
  asset: integer("asset").primaryKey().references(() => asset.id),
  evaluatedAt: text("evaluated_at").notNull(),
});
