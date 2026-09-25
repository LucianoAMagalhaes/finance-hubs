import type { Cents } from "@/shared";
import { decimalToNumber, type Decimal } from "./decimal";
import type { Trade } from "./trades";

/** What the person has of an asset: the quantity, the average price per unit and the cost, in reais. */
export type Position = {
  quantity: Decimal;
  /** Null while the quantity is zero: there is no average of nothing. */
  averagePrice: Cents | null;
  cost: Cents;
};

/** Date order, and within a date the order of entry. */
export function inHistoryOrder(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
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
 * `quantity × average price`.
 */
export function replay(trades: Trade[]): Position {
  let position: Position = { quantity: 0, averagePrice: null, cost: 0 };
  for (const t of inHistoryOrder(trades)) {
    const quantity = position.quantity + t.quantity;
    const cost = position.cost + tradeTotal(t);
    position = { quantity, averagePrice: cost / decimalToNumber(quantity), cost };
  }
  return position;
}
