import { dateOf, type Cents, type IsoDate, type IsoDateTime } from "@/shared";
import type { Asset } from "./assets";
import { businessDaysAfter } from "./businessDays";
import { ASSET_CLASSES, type AssetClass } from "./classes";
import { decimalToNumber, type Decimal } from "./decimal";
import { currencyOf, exchangeRateToNumber, type Currency, type CurrentExchangeRate, type ExchangeRate } from "./exchangeRate";
import type { Payout, PayoutKind } from "./payouts";
import { inHistoryOrder, replay, tradeAmount, tradeTotal, tradeTotalInReais, type Replay } from "./position";
import type { Quote } from "./quotes";
import type { PortfolioState } from "./state";
import type { Trade, TradeKind } from "./trades";

// Every amount here is in reais, in cents, unless its name says dollars, and
// may carry a fraction of a cent: it is only rounded for display, like the
// budget's limits. What adds up between assets, classes and the portfolio is
// always in reais; the dollars are only to show.

/** What the table's row says about the asset beyond its numbers. Each tag arrives with the ticket that sets it. */
export type AssetTag = "no-quote" | "no-exchange-rate" | "stale-quote" | "zero-position";

/** A quote or a current exchange rate older than this many business days is stale: it still gives the current value. */
const STALE_AFTER_BUSINESS_DAYS = 5;

/** A trade as the expanded row lists it. */
export type TradeView = {
  id: number;
  date: IsoDate;
  kind: TradeKind;
  quantity: Decimal;
  /** In the asset's currency. */
  unitPrice: Decimal;
  /** The exchange rate of the trade, in dollars; null in reais. */
  exchangeRate: ExchangeRate | null;
  /** quantity × unit price, in reais: in dollars, × the trade's exchange rate. */
  total: Cents;
  /** quantity × unit price, in dollars; null in reais. */
  dollarTotal: Cents | null;
  /** The sale's result in reais, fixed with the average price of its day; null on a buy. */
  realizedGain: Cents | null;
};

/**
 * The position and gain of an asset in dollars, replayed by the same rules as
 * in reais but with the trades' prices alone. Only to show: the payouts, in
 * reais, stay out of it.
 */
export type DollarView = {
  /** Null while the quantity is zero. */
  averagePrice: Cents | null;
  cost: Cents;
  /** quantity × quote, with no exchange rate at all; the cost while there is no quote. */
  currentValue: Cents;
  /** Null while the quantity is zero. */
  unrealizedGain: Cents | null;
  realizedGain: Cents;
  /** Unrealized gain + the sales' results. */
  totalGain: Cents;
};

/** A payout as the expanded row lists it. */
export type PayoutView = { id: number; date: IsoDate; kind: PayoutKind; amount: Cents };

/** An asset as its class's table shows it, with its trades and payouts for the expanded row. */
export type AssetView = {
  id: number;
  ticker: string;
  assetClass: AssetClass;
  currency: Currency;
  quantity: Decimal;
  /** Null while the quantity is zero. */
  averagePrice: Cents | null;
  cost: Cents;
  /** The last quote, per unit, in the asset's currency; null while the asset never had one. */
  quote: Cents | null;
  /** When the last quote was obtained; null while the asset never had one. */
  quoteAt: IsoDateTime | null;
  /**
   * quantity × quote, and in dollars × the current exchange rate; the cost
   * while there is no quote, or no current exchange rate.
   */
  currentValue: Cents;
  /** Current value − cost; null while the quantity is zero. */
  unrealizedGain: Cents | null;
  /** The sum of the sales' results. */
  realizedGain: Cents;
  /** The sum of the payouts. */
  payoutsReceived: Cents;
  /** Unrealized gain + the sales' results + the payouts; it outlives the position. */
  totalGain: Cents;
  /** The total gain as a percentage of the cost; null while the cost is zero. */
  totalGainPercent: number | null;
  /** The same position in dollars, for an asset in dollars; null in reais. */
  inDollars: DollarView | null;
  tags: AssetTag[];
  /** Newest first; on the same date, the last entered first. */
  trades: TradeView[];
  /** Newest first; on the same date, the last entered first. */
  payouts: PayoutView[];
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
  /** By ticker, the zero positions last. */
  assets: AssetView[];
};

/** The whole snapshot, derived and never stored, that feeds the screen. */
export type PortfolioView = {
  currentValue: Cents;
  cost: Cents;
  totalGain: Cents;
  /** How much of the total gain came from payouts. */
  payoutsReceived: Cents;
  /** The time of the last fetch that brought quotes; null while there was none. */
  quotesAt: IsoDateTime | null;
  /** Whether an asset with position carries a stale quote. */
  staleQuote: boolean;
  /** The last current exchange rate; null while there never was one. */
  exchangeRate: CurrentExchangeRate | null;
  /** Whether the current exchange rate is stale while an asset in dollars has position. */
  staleExchangeRate: boolean;
  classes: ClassView[];
};

export function projectPortfolio(state: PortfolioState, today: IsoDate): PortfolioView {
  const assets = state.assets.map((a) =>
    projectAsset(
      a,
      state.trades.filter((t) => t.asset === a.id),
      state.payouts.filter((p) => p.asset === a.id),
      state.quotes.find((q) => q.asset === a.id) ?? null,
      state.exchangeRate,
      today,
    ),
  );
  const zeroLast = (a: AssetView) => (a.tags.includes("zero-position") ? 1 : 0);
  const byClass = (id: AssetClass) =>
    assets.filter((a) => a.assetClass === id).sort((a, b) => zeroLast(a) - zeroLast(b) || a.ticker.localeCompare(b.ticker));
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
  return {
    currentValue,
    cost: sum(assets, (a) => a.cost),
    totalGain: sum(assets, (a) => a.totalGain),
    payoutsReceived: sum(assets, (a) => a.payoutsReceived),
    quotesAt: state.lastFetch.quotes ?? null,
    staleQuote: assets.some((a) => a.tags.includes("stale-quote") && !a.tags.includes("zero-position")),
    exchangeRate: state.exchangeRate,
    staleExchangeRate:
      state.exchangeRate !== null &&
      isStale(state.exchangeRate.at, today) &&
      assets.some((a) => a.currency === "USD" && !a.tags.includes("zero-position")),
    classes,
  };
}

function projectAsset(
  asset: Asset,
  trades: Trade[],
  payouts: Payout[],
  quote: Quote | null,
  rate: CurrentExchangeRate | null,
  today: IsoDate,
): AssetView {
  const currency = currencyOf(asset.assetClass);
  const inReais = replay(trades, tradeTotalInReais);
  const { position, realizedGain, realizedGainBySale } = inReais;
  const quoted = quote && tradeAmount(position.quantity, quote.price);
  // An asset that never had a quote, or in dollars a current exchange rate, is
  // worth its cost, so the portfolio loses no value for lack of a price.
  const currentValue =
    quoted === null ? position.cost : currency === "BRL" ? quoted : rate ? quoted * exchangeRateToNumber(rate.rate) : position.cost;
  const zero = position.quantity === 0;
  const unrealizedGain = zero ? null : currentValue - position.cost;
  const tags: AssetTag[] = [];
  if (!quote) tags.push("no-quote");
  if (currency === "USD" && !rate) tags.push("no-exchange-rate");
  if (quote && isStale(quote.at, today)) tags.push("stale-quote");
  if (zero) tags.push("zero-position");
  const payoutsReceived = payouts.reduce((s, p) => s + p.amount, 0);
  const totalGain = (unrealizedGain ?? 0) + realizedGain + payoutsReceived;
  return {
    id: asset.id,
    ticker: asset.ticker,
    assetClass: asset.assetClass,
    currency,
    ...position,
    quote: quote && decimalToNumber(quote.price) * 100,
    quoteAt: quote?.at ?? null,
    currentValue,
    unrealizedGain,
    realizedGain,
    payoutsReceived,
    totalGain,
    totalGainPercent: position.cost > 0 ? (totalGain / position.cost) * 100 : null,
    inDollars: currency === "USD" ? inDollars(replay(trades, tradeTotal), quoted) : null,
    tags,
    trades: inHistoryOrder(trades)
      .reverse()
      .map((t) => ({
        id: t.id,
        date: t.date,
        kind: t.kind,
        quantity: t.quantity,
        unitPrice: t.unitPrice,
        exchangeRate: t.exchangeRate,
        total: tradeTotalInReais(t),
        dollarTotal: currency === "USD" ? tradeTotal(t) : null,
        realizedGain: realizedGainBySale.get(t.id) ?? null,
      })),
    payouts: inHistoryOrder(payouts)
      .reverse()
      .map(({ id, date, kind, amount }) => ({ id, date, kind, amount })),
  };
}

/** The dollars' replay, valued by the quote in dollars, or at cost with no quote. */
function inDollars({ position, realizedGain }: Replay, quoted: Cents | null): DollarView {
  const currentValue = quoted ?? position.cost;
  const unrealizedGain = position.quantity === 0 ? null : currentValue - position.cost;
  return {
    averagePrice: position.averagePrice,
    cost: position.cost,
    currentValue,
    unrealizedGain,
    realizedGain,
    totalGain: (unrealizedGain ?? 0) + realizedGain,
  };
}

const isStale = (at: IsoDateTime, today: IsoDate) => businessDaysAfter(dateOf(at), today) > STALE_AFTER_BUSINESS_DAYS;
