import { formatDate, type Cents, type IsoDate } from "@/shared";
import type { Asset } from "./assets";
import { isPrivateBond, type PrivateBond } from "./bonds";
import { businessDaysBetween, isBusinessDay } from "./businessDays";
import { decimal, decimalToNumber, type Decimal } from "./decimal";
import { inHistoryOrder, type PricedTrade } from "./position";
import type { PortfolioState } from "./state";
import type { Trade, UnitTrade } from "./trades";
import type { RateIndex } from "./rateIndexes";

/** A year of business days, the base of every rate a year. */
const BUSINESS_DAYS_A_YEAR = 252;

/** A share on the day of the first application: R$ 1,00. */
const ONE = decimal(1);

/**
 * The accrued price of one share of the bond on the date: 1 on the day of the
 * first application, growing by the indexer over the business days from it,
 * included, to the earlier of the date and maturity, excluded, so today's
 * price uses the rates up to yesterday and freezes at maturity.
 * A fixed rate grows by `(1 + rate)^(business days ÷ 252)`; a percentage of
 * CDI by the product of `1 + percentage × daily CDI` on business days. IPCA
 * plus multiplies the normalized inflation index by the yearly spread. The
 * factor is computed in floating point and rounded to the 8 places. Null
 * before the first application, and while the index the indexer needs was
 * never brought.
 */
export function accruedPrice(bond: PrivateBond, firstApplication: IsoDate, date: IsoDate, rateIndexes: RateIndex[]): Decimal | null {
  if (date < firstApplication) return null;
  const until = date < bond.maturityDate ? date : bond.maturityDate;
  if (bond.indexer === "cdi-percentage") return accruedCdi(bond.rate, firstApplication, until, rateIndexes);
  if (bond.indexer === "ipca-plus") return accruedIpca(bond.rate, firstApplication, until, rateIndexes);
  const years = businessDaysBetween(firstApplication, until) / BUSINESS_DAYS_A_YEAR;
  return decimal((1 + decimalToNumber(bond.rate) / 100) ** years);
}

/** NTN-B: a month's inflation accrues from its 15th to the next month's 15th. */
function accruedIpca(rate: Decimal, from: IsoDate, until: IsoDate, rateIndexes: RateIndex[]): Decimal | null {
  const monthly = new Map<IsoDate, Decimal>();
  for (const r of rateIndexes) if (r.kind === "ipca-projection") monthly.set(r.date, r.rate);
  for (const r of rateIndexes) if (r.kind === "ipca") monthly.set(r.date, r.rate);
  if (!monthly.has(`${from.slice(0, 7)}-01` as IsoDate)) return null;
  let factor = 1;
  const start = new Date(`${from.slice(0, 7)}-15T00:00:00Z`);
  if (from.slice(8) < "15") start.setUTCMonth(start.getUTCMonth() - 1);
  while (start.toISOString().slice(0, 10) < until) {
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const lower = start.toISOString().slice(0, 10) as IsoDate;
    const upper = end.toISOString().slice(0, 10) as IsoDate;
    const monthlyRate = monthly.get(`${lower.slice(0, 7)}-01` as IsoDate);
    // An absent later month contributes no inflation until its source answers.
    if (monthlyRate !== undefined) {
      const days = businessDaysBetween(from > lower ? from : lower, until < upper ? until : upper);
      factor *= (1 + decimalToNumber(monthlyRate) / 100) ** (days / businessDaysBetween(lower, upper));
    }
    start.setUTCMonth(start.getUTCMonth() + 1);
  }
  return decimal(factor * (1 + decimalToNumber(rate) / 100) ** (businessDaysBetween(from, until) / BUSINESS_DAYS_A_YEAR));
}

/** The daily product, carrying the last published CDI through any missing business day. */
function accruedCdi(rate: Decimal, from: IsoDate, until: IsoDate, rateIndexes: RateIndex[]): Decimal | null {
  const rates = rateIndexes.filter((r) => r.kind === "cdi" && r.date <= until).sort((a, b) => a.date.localeCompare(b.date));
  if (!rates.some((r) => r.date >= from)) return null;
  let next = 0;
  let last: Decimal | null = null;
  let factor = 1;
  const p = decimalToNumber(rate) / 100;
  for (let day = Date.parse(`${from}T00:00:00Z`); day < Date.parse(`${until}T00:00:00Z`); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10) as IsoDate;
    while (next < rates.length && rates[next]!.date <= date) last = rates[next++]!.rate;
    if (isBusinessDay(date) && last !== null) factor *= 1 + p * decimalToNumber(last) / 100;
  }
  return decimal(factor);
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
 * Replay clamps an overcurve redemption to all available shares. Validation
 * supplies only the ids previously clamped after an index revision.
 */
export function pricedTrades(asset: Asset | undefined, trades: Trade[], rateIndexes: RateIndex[], redemptionsToClamp: ReadonlySet<number> | null = null): Priced {
  if (!isPrivateBond(asset)) return { trades: trades.filter((t): t is UnitTrade => !("amount" in t)), price: () => null };
  const { bond } = asset;
  const first = inHistoryOrder(trades).find((t) => t.kind === "buy")?.date;
  const price = (date: IsoDate) => (first === undefined ? null : accruedPrice(bond, first, date, rateIndexes));
  let available = 0;
  return {
    trades: inHistoryOrder(trades).map((t) => {
      if (!("amount" in t)) return t;
      const unitPrice = price(t.date) ?? ONE;
      const { amount, ...rest } = t;
      const exceedsCurve = t.kind === "sell" && BigInt(amount) * 10n ** 14n > BigInt(available) * BigInt(unitPrice);
      const redeemsAll = t.kind === "sell" && (t.redeemsAll || ((redemptionsToClamp === null || redemptionsToClamp.has(t.id)) && exceedsCurve));
      const quantity = redeemsAll ? available : sharesOf(amount, unitPrice);
      available = t.kind === "buy" ? available + quantity : Math.max(0, available - quantity);
      return { ...rest, ...(redeemsAll && { redeemsAll: true }), quantity, unitPrice, exchangeRate: null, amount };
    }),
    price,
  };
}

/** All of an asset's trades in units, to be replayed up to any date. */
export const tradesInUnits = (state: PortfolioState, asset: number, redemptionsToClamp: ReadonlySet<number> | null = null): PricedTrade[] =>
  pricedTrades(
    state.assets.find((a) => a.id === asset),
    state.trades.filter((t) => t.asset === asset),
    state.rateIndexes,
    redemptionsToClamp,
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
