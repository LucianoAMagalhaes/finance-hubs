import type { Cents, IsoDate } from "@/shared";
import type { Asset } from "./assets";
import { ASSET_CLASSES, type AssetClass } from "./classes";
import type { Decimal } from "./decimal";
import { inHistoryOrder, replay, tradeTotal } from "./position";
import type { PortfolioState } from "./state";
import type { Trade, TradeKind } from "./trades";

// Every amount here is in reais, in cents, and may carry a fraction of a cent:
// it is only rounded for display, like the budget's limits.

/** What the table's row says about the asset beyond its numbers. Each tag arrives with the ticket that sets it. */
export type AssetTag = "no-quote";

/** A trade as the expanded row lists it. */
export type TradeView = {
  id: number;
  date: IsoDate;
  kind: TradeKind;
  quantity: Decimal;
  unitPrice: Decimal;
  /** quantity × unit price. */
  total: Cents;
};

/** An asset as its class's table shows it, with its trades for the expanded row. */
export type AssetView = {
  id: number;
  ticker: string;
  assetClass: AssetClass;
  quantity: Decimal;
  /** Null while the quantity is zero. */
  averagePrice: Cents | null;
  cost: Cents;
  /** The last quote, per unit; null while the asset never had one. */
  quote: Cents | null;
  /** quantity × quote; the cost while there is no quote. */
  currentValue: Cents;
  totalGain: Cents;
  tags: AssetTag[];
  /** Newest first; on the same date, the last entered first. */
  trades: TradeView[];
};

/** A class as the dashboard shows it: its card, its slice of the bars and its detail's header. */
export type ClassView = {
  key: AssetClass;
  name: string;
  /** The current value of the class's assets. */
  value: Cents;
  /** The class's share of the portfolio's current value, from 0 to 100; 0 while the portfolio is worth nothing. */
  share: number;
  target: number;
  /** How much the class is below its target's value (`target × portfolio value − value`); negative when above. */
  toTarget: Cents;
  totalGain: Cents;
  /** How many assets the class has, with or without position. */
  assetCount: number;
  /** By ticker. */
  assets: AssetView[];
};

/** The whole snapshot, derived and never stored, that feeds the screen. */
export type PortfolioView = {
  currentValue: Cents;
  cost: Cents;
  totalGain: Cents;
  /** How much of the total gain came from payouts. */
  payouts: Cents;
  classes: ClassView[];
};

export function projectPortfolio(state: PortfolioState, today: IsoDate): PortfolioView {
  void today; // Every trade is dated up to today; quotes will be dated against it.
  const assets = state.assets.map((a) => projectAsset(a, state.trades.filter((t) => t.asset === a.id)));
  const byClass = (id: AssetClass) =>
    assets.filter((a) => a.assetClass === id).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const sum = (list: AssetView[], amount: (a: AssetView) => Cents) => list.reduce((s, a) => s + amount(a), 0);

  const currentValue = sum(assets, (a) => a.currentValue);
  const classes = ASSET_CLASSES.map(({ id, name }): ClassView => {
    const own = byClass(id);
    const value = sum(own, (a) => a.currentValue);
    const target = state.targets[id];
    return {
      key: id,
      name,
      value,
      share: currentValue > 0 ? (value / currentValue) * 100 : 0,
      target,
      toTarget: (target / 100) * currentValue - value,
      totalGain: sum(own, (a) => a.totalGain),
      assetCount: own.length,
      assets: own,
    };
  });
  return { currentValue, cost: sum(assets, (a) => a.cost), totalGain: sum(assets, (a) => a.totalGain), payouts: 0, classes };
}

function projectAsset(asset: Asset, trades: Trade[]): AssetView {
  const position = replay(trades);
  // No source brings quotes yet: every asset is worth its cost, tagged as such.
  const currentValue = position.cost;
  return {
    id: asset.id,
    ticker: asset.ticker,
    assetClass: asset.assetClass,
    ...position,
    quote: null,
    currentValue,
    totalGain: currentValue - position.cost,
    tags: ["no-quote"],
    trades: inHistoryOrder(trades)
      .reverse()
      .map((t) => ({ id: t.id, date: t.date, kind: t.kind, quantity: t.quantity, unitPrice: t.unitPrice, total: tradeTotal(t) })),
  };
}
