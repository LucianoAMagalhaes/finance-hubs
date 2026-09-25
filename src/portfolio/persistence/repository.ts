import {
  ASSET_CLASSES,
  type Asset,
  type AssetClass,
  type PortfolioState,
  type Targets,
  type Trade,
} from "@/portfolio/domain";
import { notInArray } from "drizzle-orm";
import type { Connection, Database } from "@/persistence/database";
import { asset, classTarget, trade } from "./schema";

// No business rule here: validating and deriving belong to the domain. This
// module only translates the portfolio's state into rows and back.

type AssetRow = typeof asset.$inferSelect;
type TradeRow = typeof trade.$inferSelect;

const toAsset = (row: AssetRow): Asset => ({ id: row.id, ticker: row.ticker, assetClass: row.assetClass as AssetClass });

const toTrade = (row: TradeRow): Trade => ({
  id: row.id,
  asset: row.asset,
  kind: row.kind as Trade["kind"],
  date: row.date as Trade["date"],
  quantity: row.quantity,
  unitPrice: row.unitPrice,
});

export const loadPortfolio = ({ db }: Database): PortfolioState => load(db);

/** The migration creates the five target rows, so every class always has its target. */
export function load(db: Connection): PortfolioState {
  const targets = {} as Targets;
  for (const row of db.select().from(classTarget).all()) targets[row.assetClass as AssetClass] = row.target;
  return {
    targets,
    assets: db.select().from(asset).orderBy(asset.id).all().map(toAsset),
    trades: db.select().from(trade).orderBy(trade.id).all().map(toTrade),
  };
}

/**
 * Saves the state the command returned, inside the caller's transaction. Rows
 * are inserted or rewritten, and a trade or asset the state no longer has is
 * deleted for good: the portfolio has no trash.
 */
export function save(tx: Connection, state: PortfolioState): void {
  tx.delete(trade).where(notInArray(trade.id, state.trades.map((t) => t.id))).run();
  tx.delete(asset).where(notInArray(asset.id, state.assets.map((a) => a.id))).run();
  for (const { id } of ASSET_CLASSES) {
    const row = { assetClass: id, target: state.targets[id] };
    tx.insert(classTarget).values(row).onConflictDoUpdate({ target: classTarget.assetClass, set: row }).run();
  }
  for (const a of state.assets) {
    const row: AssetRow = { id: a.id, ticker: a.ticker, assetClass: a.assetClass };
    tx.insert(asset).values(row).onConflictDoUpdate({ target: asset.id, set: row }).run();
  }
  for (const t of state.trades) {
    const row: TradeRow = { ...t };
    tx.insert(trade).values(row).onConflictDoUpdate({ target: trade.id, set: row }).run();
  }
}
