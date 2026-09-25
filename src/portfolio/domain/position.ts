import type { Cents, IsoDate } from "@/shared";
import { decimalToNumber, type Decimal } from "./decimal";
import type { Trade } from "./trades";

/** What the person has of an asset: the quantity, the average price per unit and the cost, in reais. */
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

/** A trade's amount in reais. */
export const tradeTotal = (t: Trade): Cents => tradeAmount(t.quantity, t.unitPrice);

/** From quantity × unit price, both scaled to 8 places, to cents. */
const CENTS_SCALE = 1e14;

/**
 * Replays an asset's history in date order. Each buy recalculates the average
 * price, `(cost + quantity × price) ÷ new quantity`, so the cost stays
 * `quantity × average price`. A sale reduces the quantity, keeps the average
 * price and fixes its result against it; selling everything makes the average
 * price stop existing, and the next buy starts from nothing.
 */
export function replay(trades: Trade[]): Replay {
  let position: Position = { quantity: 0, averagePrice: null, cost: 0 };
  let realizedGain = 0;
  const realizedGainBySale = new Map<number, Cents>();
  for (const t of inHistoryOrder(trades)) {
    if (t.kind === "buy") {
      const quantity = position.quantity + t.quantity;
      const cost = position.cost + tradeTotal(t);
      position = { quantity, averagePrice: cost / decimalToNumber(quantity), cost };
      continue;
    }
    if (t.quantity > position.quantity || position.averagePrice === null) {
      return { position, realizedGain, realizedGainBySale, uncovered: { sale: t, available: position.quantity } };
    }
    const averagePrice = position.averagePrice;
    const result = tradeTotal(t) - averagePrice * decimalToNumber(t.quantity);
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
