import { formatDate, type Cents, type IsoDate } from "@/shared";
import type { Asset } from "./assets";
import { isPrivateBond, type PrivateBond } from "./bonds";
import { businessDaysBetween } from "./businessDays";
import { decimal, decimalToNumber, type Decimal } from "./decimal";
import { inHistoryOrder, type PricedTrade } from "./position";
import type { PortfolioState } from "./state";
import type { Trade, UnitTrade } from "./trades";

/** A year of business days, the base of every rate a year. */
const BUSINESS_DAYS_A_YEAR = 252;

/** A share on the day of the first application: R$ 1,00. */
const ONE = decimal(1);

/**
 * The accrued price of one share of the bond on the date: 1 on the day of the
 * first application, growing by the indexer over the business days from it,
 * included, to the date, excluded, so today's price uses the rates up to
 * yesterday. A fixed rate grows by `(1 + rate)^(business days ÷ 252)`. The
 * factor is computed in floating point and rounded to the 8 places. Null
 * before the first application, and while the index the indexer needs was
 * never brought.
 */
export function accruedPrice(bond: PrivateBond, firstApplication: IsoDate, date: IsoDate): Decimal | null {
  if (date < firstApplication) return null;
  // The CDI and the IPCA arrive with their tickets: until then, no bond indexed to them has a price.
  if (bond.indexer !== "fixed-rate") return null;
  const years = businessDaysBetween(firstApplication, date) / BUSINESS_DAYS_A_YEAR;
  return decimal((1 + decimalToNumber(bond.rate) / 100) ** years);
}

/** An asset's trades as the replay reads them, and the price of one unit on a date, for a private bond. */
export type Priced = {
  trades: PricedTrade[];
  /** The accrued price on the date; null outside a private bond, before its first application, or with no index. */
  price: (date: IsoDate) => Decimal | null;
};

/**
 * An asset's trades in units. A private bond's application becomes
 * `amount ÷ accrued price` shares, rounded to the 8 places, at that price.
 * A partial redemption uses the same conversion; a total redemption takes
 * every share available in date and entry order, keeping the curve price
 * for display and the amount received for its realized gain.
 * Without an accrued price (no index yet), a share stays at R$ 1,00, so the
 * bond is worth its cost. Every other asset's trades are already in units.
 */
export function pricedTrades(asset: Asset | undefined, trades: Trade[]): Priced {
  if (!isPrivateBond(asset)) return { trades: trades.filter((t): t is UnitTrade => !("amount" in t)), price: () => null };
  const { bond } = asset;
  const first = inHistoryOrder(trades).find((t) => t.kind === "buy")?.date;
  const price = (date: IsoDate) => (first === undefined ? null : accruedPrice(bond, first, date));
  let available = 0;
  return {
    trades: inHistoryOrder(trades).map((t) => {
      if (!("amount" in t)) return t;
      const unitPrice = price(t.date) ?? ONE;
      const { amount, ...rest } = t;
      const quantity = t.kind === "sell" && t.redeemsAll ? available : sharesOf(amount, unitPrice);
      available = t.kind === "buy" ? available + quantity : Math.max(0, available - quantity);
      return { ...rest, quantity, unitPrice, exchangeRate: null, amount };
    }),
    price,
  };
}

/** All of an asset's trades in units, to be replayed up to any date. */
export const tradesInUnits = (state: PortfolioState, asset: number): PricedTrade[] =>
  pricedTrades(
    state.assets.find((a) => a.id === asset),
    state.trades.filter((t) => t.asset === asset),
  ).trades;

/** An application or partial redemption must represent shares at the supported precision. */
export function whyUnrepresentableTrade(state: PortfolioState, id: number): string | null {
  const asset = state.assets.find((a) => a.id === id);
  if (!isPrivateBond(asset)) return null;
  const trade = tradesInUnits(state, id).find((t) => t.quantity === 0 && !t.redeemsAll);
  return trade
    ? `O valor ${trade.kind === "buy" ? "da aplicação" : "do resgate"} de ${asset.ticker} de ${formatDate(trade.date)} é pequeno demais para representar as cotas com até 8 casas decimais.`
    : null;
}

/** amount ÷ price, in shares, rounded to the 8 places, exact: cents × 10¹⁴ ÷ the scaled price. */
function sharesOf(amount: Cents, price: Decimal): Decimal {
  const scaled = BigInt(amount) * 10n ** 14n;
  return Number((scaled * 2n + BigInt(price)) / (2n * BigInt(price)));
}
