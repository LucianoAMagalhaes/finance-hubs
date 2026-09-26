import type { Cents, IsoDate } from "@/shared";
import type { CorporateAction } from "./corporateActions";
import { decimalToNumber, type Decimal } from "./decimal";
import type { Trade } from "./trades";

/** What the person has of an asset: the quantity, the average price per unit and the cost, in one currency. */
export type Position = {
  quantity: Decimal;
  /** Null while the quantity is zero: there is no average of nothing. */
  averagePrice: Cents | null;
  cost: Cents;
};

/** An asset's history replayed: where it ends, and what each sale fixed on its day. */
export type Replay = {
  position: Position;
  /** The sum of the sales' results. */
  realizedGain: Cents;
  /** Each sale's result, by the trade's id. */
  realizedGainBySale: Map<number, Cents>;
  /**
   * The first sale larger than the quantity there was when it came, with that
   * quantity. The replay stops there: past it the history makes no sense.
   */
  uncovered: { sale: Trade; available: Decimal } | null;
};

/** Date order, and within a date the order of entry. */
export function inHistoryOrder<T extends { date: IsoDate; id: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

/**
 * quantity × unit price, in cents. The product of the two scaled integers is
 * exact; only the result may carry a fraction of a cent.
 */
export const tradeAmount = (quantity: Decimal, unitPrice: Decimal): Cents =>
  Number(BigInt(quantity) * BigInt(unitPrice)) / CENTS_SCALE;

/** A trade's amount in the asset's currency. */
export const tradeTotal = (t: Trade): Cents => tradeAmount(t.quantity, t.unitPrice);

/**
 * A trade's amount in reais: in dollars, quantity × unit price × the trade's
 * exchange rate, multiplied exactly before the only division.
 */
export const tradeTotalInReais = (t: Trade): Cents =>
  t.exchangeRate === null
    ? tradeTotal(t)
    : Number(BigInt(t.quantity) * BigInt(t.unitPrice) * BigInt(t.exchangeRate)) / (CENTS_SCALE * RATE_SCALE);

/** From quantity × unit price, both scaled to 8 places, to cents. */
const CENTS_SCALE = 1e14;
/** The exchange rate's 4 places. */
const RATE_SCALE = 1e4;

/**
 * An asset's trades and corporate actions in the order they count: date
 * order, the actions of a date before its trades, and each kind in its order
 * of entry.
 */
function historyOrder(trades: Trade[], corporateActions: CorporateAction[]): (Trade | CorporateAction)[] {
  const actions = inHistoryOrder(corporateActions);
  const history: (Trade | CorporateAction)[] = [];
  let next = 0;
  for (const t of inHistoryOrder(trades)) {
    while (next < actions.length && actions[next]!.date <= t.date) history.push(actions[next++]!);
    history.push(t);
  }
  return [...history, ...actions.slice(next)];
}

/**
 * The quantity × to ÷ from of a corporate action, exact, rounded down to the
 * 8 places: a fraction left over stays in the quantity.
 */
const afterAction = (quantity: Decimal, { ratio }: CorporateAction): Decimal =>
  Number((BigInt(quantity) * BigInt(ratio.to)) / BigInt(ratio.from));

/**
 * Replays an asset's history in date order, each trade worth `amount`: its
 * total in the currency being replayed. An asset in dollars is replayed twice
 * by the same rules, in dollars and in reais. Each buy recalculates the average
 * price, `(cost + quantity × price) ÷ new quantity`, so the cost stays
 * `quantity × average price`. A sale reduces the quantity, keeps the average
 * price and fixes its result against it; selling everything makes the average
 * price stop existing, and the next buy starts from nothing. A corporate
 * action multiplies the quantity by its ratio and keeps the cost, so the
 * average price adjusts; with no quantity, it changes nothing.
 */
export function replay(trades: Trade[], corporateActions: CorporateAction[], amount: (t: Trade) => Cents = tradeTotalInReais): Replay {
  let position: Position = { quantity: 0, averagePrice: null, cost: 0 };
  let realizedGain = 0;
  const realizedGainBySale = new Map<number, Cents>();
  for (const t of historyOrder(trades, corporateActions)) {
    if ("ratio" in t) {
      const quantity = afterAction(position.quantity, t);
      position =
        quantity === 0 ? { quantity, averagePrice: null, cost: 0 } : { quantity, averagePrice: position.cost / decimalToNumber(quantity), cost: position.cost };
      continue;
    }
    if (t.kind === "buy") {
      const quantity = position.quantity + t.quantity;
      const cost = position.cost + amount(t);
      position = { quantity, averagePrice: cost / decimalToNumber(quantity), cost };
      continue;
    }
    if (t.quantity > position.quantity || position.averagePrice === null) {
      return { position, realizedGain, realizedGainBySale, uncovered: { sale: t, available: position.quantity } };
    }
    const averagePrice = position.averagePrice;
    const result = amount(t) - averagePrice * decimalToNumber(t.quantity);
    realizedGainBySale.set(t.id, result);
    realizedGain += result;
    const quantity = position.quantity - t.quantity;
    position =
      quantity === 0
        ? { quantity, averagePrice: null, cost: 0 }
        : { quantity, averagePrice, cost: averagePrice * decimalToNumber(quantity) };
  }
  return { position, realizedGain, realizedGainBySale, uncovered: null };
}
