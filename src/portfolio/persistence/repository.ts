import {
  ASSET_CLASSES,
  type Asset,
  type AssetClass,
  type FetchKind,
  type IsoDateTime,
  type LastFetch,
  type Payout,
  type PortfolioState,
  type Quote,
  type Targets,
  type Trade,
} from "@/portfolio/domain";
import { notInArray } from "drizzle-orm";
import type { Connection, Database } from "@/persistence/database";
import { asset, classTarget, currentExchangeRate, lastFetch, payout, quote, trade } from "./schema";

// No business rule here: validating and deriving belong to the domain. This
// module only translates the portfolio's state into rows and back.

type AssetRow = typeof asset.$inferSelect;
type TradeRow = typeof trade.$inferSelect;
type PayoutRow = typeof payout.$inferSelect;
type QuoteRow = typeof quote.$inferSelect;

const toAsset = (row: AssetRow): Asset => ({
  id: row.id,
  ticker: row.ticker,
  assetClass: row.assetClass as AssetClass,
  sourceId: row.sourceId,
});

const toTrade = (row: TradeRow): Trade => ({
  id: row.id,
  asset: row.asset,
  kind: row.kind as Trade["kind"],
  date: row.date as Trade["date"],
  quantity: row.quantity,
  unitPrice: row.unitPrice,
  exchangeRate: row.exchangeRate,
});

const toPayout = (row: PayoutRow): Payout => ({
  id: row.id,
  asset: row.asset,
  date: row.date as Payout["date"],
  kind: row.kind as Payout["kind"],
  amount: row.amount,
});

const toQuote = (row: QuoteRow): Quote => ({ asset: row.asset, price: row.price, at: row.at as Quote["at"] });

export const loadPortfolio = ({ db }: Database): PortfolioState => load(db);

/** The single row of the current exchange rate. */
const CURRENT_EXCHANGE_RATE_ROW = 1;

/** The migration creates the five target rows, so every class always has its target. */
export function load(db: Connection): PortfolioState {
  const targets = {} as Targets;
  for (const row of db.select().from(classTarget).all()) targets[row.assetClass as AssetClass] = row.target;
  const fetched: LastFetch = {};
  for (const row of db.select().from(lastFetch).all()) fetched[row.kind as FetchKind] = row.at as LastFetch[FetchKind];
  const rate = db.select().from(currentExchangeRate).get();
  return {
    targets,
    assets: db.select().from(asset).orderBy(asset.id).all().map(toAsset),
    trades: db.select().from(trade).orderBy(trade.id).all().map(toTrade),
    payouts: db.select().from(payout).orderBy(payout.id).all().map(toPayout),
    quotes: db.select().from(quote).orderBy(quote.asset).all().map(toQuote),
    exchangeRate: rate ? { rate: rate.rate, at: rate.at as IsoDateTime } : null,
    lastFetch: fetched,
  };
}

/**
 * Saves the state the command returned, inside the caller's transaction. Rows
 * are inserted or rewritten, and a trade, payout, quote or asset the state no longer has is
 * deleted for good: the portfolio has no trash.
 */
export function save(tx: Connection, state: PortfolioState): void {
  tx.delete(trade).where(notInArray(trade.id, state.trades.map((t) => t.id))).run();
  tx.delete(payout).where(notInArray(payout.id, state.payouts.map((p) => p.id))).run();
  tx.delete(quote).where(notInArray(quote.asset, state.quotes.map((q) => q.asset))).run();
  tx.delete(asset).where(notInArray(asset.id, state.assets.map((a) => a.id))).run();
  for (const { id } of ASSET_CLASSES) {
    const row = { assetClass: id, target: state.targets[id] };
    tx.insert(classTarget).values(row).onConflictDoUpdate({ target: classTarget.assetClass, set: row }).run();
  }
  for (const a of state.assets) {
    const row: AssetRow = { ...a };
    tx.insert(asset).values(row).onConflictDoUpdate({ target: asset.id, set: row }).run();
  }
  for (const t of state.trades) {
    const row: TradeRow = { ...t };
    tx.insert(trade).values(row).onConflictDoUpdate({ target: trade.id, set: row }).run();
  }
  for (const p of state.payouts) {
    const row: PayoutRow = { ...p };
    tx.insert(payout).values(row).onConflictDoUpdate({ target: payout.id, set: row }).run();
  }
  for (const q of state.quotes) {
    const row: QuoteRow = { ...q };
    tx.insert(quote).values(row).onConflictDoUpdate({ target: quote.asset, set: row }).run();
  }
  if (state.exchangeRate) {
    const row = { id: CURRENT_EXCHANGE_RATE_ROW, ...state.exchangeRate };
    tx.insert(currentExchangeRate).values(row).onConflictDoUpdate({ target: currentExchangeRate.id, set: row }).run();
  } else {
    tx.delete(currentExchangeRate).run();
  }
  for (const [kind, at] of Object.entries(state.lastFetch)) {
    const row = { kind, at };
    tx.insert(lastFetch).values(row).onConflictDoUpdate({ target: lastFetch.kind, set: row }).run();
  }
}
