import {
  currencyOf,
  hasCorporateActions,
  minutesBetween,
  type Asset,
  type AssetClass,
  type CurrentExchangeRate,
  type FetchKind,
  type IsoDateTime,
  type PortfolioCommand,
  type PortfolioState,
  type QuoteToRecord,
  type SourceCorporateAction,
  type SourcePayout,
} from "@/portfolio/domain";
import type { Sources } from "./port";

/** A quote or a current exchange rate obtained more than this many minutes ago is fetched again. */
const FRESH_MINUTES = 15;

/** Payouts and corporate actions fetched less than a day ago are not fetched again: they don't change the value of now. */
const FRESH_ANNOUNCED_MINUTES = 24 * 60;

/**
 * Decides what to fetch and turns what the sources bring into commands; it
 * never writes. Fetches the quotes older than 15 minutes, and by the same rule
 * the current exchange rate while an asset is in dollars, and the payouts and
 * corporate actions fetched more than a day ago, or all of them when forced.
 * A source that fails doesn't stop the others.
 */
export async function refresh(state: PortfolioState, sources: Sources, now: IsoDateTime, force: boolean): Promise<PortfolioCommand[]> {
  const results = await Promise.all([
    refreshQuotes(state, sources, now, force),
    refreshPayouts(state, sources, now, force),
    refreshCorporateActions(state, sources, now, force),
  ]);
  return results.flat();
}

/**
 * A quote that fails leaves its asset with its last quote, and the portfolio
 * with its last rate. The fetch of quotes counts as successful when any quote
 * came: a rate alone keeps only its own time.
 */
async function refreshQuotes(state: PortfolioState, sources: Sources, now: IsoDateTime, force: boolean): Promise<PortfolioCommand[]> {
  const due = state.assets.filter((a) => hasSource(a) && (force || isOld(state.quotes.find((q) => q.asset === a.id)?.at, now)));
  const rateDue = state.assets.some((a) => currencyOf(a.assetClass) === "USD") && (force || isOld(state.exchangeRate?.at, now));
  if (due.length === 0 && !rateDue) return [];

  const [answers, rate] = await Promise.all([
    Promise.allSettled(due.map((a) => sources.latestQuote(a))),
    rateDue ? fetchRate(sources, now) : null,
  ]);
  const quotes: QuoteToRecord[] = [];
  answers.forEach((answer, i) => {
    if (answer.status === "fulfilled") quotes.push({ asset: due[i]!.id, price: answer.value, at: now });
    else console.warn(`No quote for ${due[i]!.ticker}:`, answer.reason);
  });

  if (quotes.length === 0 && !rate) return [];
  const recorded: PortfolioCommand = { type: "record-quotes", quotes, ...(rate && { exchangeRate: rate }) };
  return quotes.length === 0 ? [recorded] : [recorded, { type: "record-fetch", kind: "quotes", at: now }];
}

/**
 * Asks the payouts of every B3 stock and fund with an ISIN that had a position
 * at some moment, since the domain only records what a position earned.
 */
function refreshPayouts(state: PortfolioState, sources: Sources, now: IsoDateTime, force: boolean): Promise<PortfolioCommand[]> {
  const due = state.assets.filter((a) => PAYING_CLASSES.includes(a.assetClass) && a.sourceId && hadPosition(state, a));
  return refreshAnnounced<SourcePayout>(state, due, "payouts", (a) => sources.payouts(a), (payouts) => ({ type: "record-source-payouts", payouts }), now, force);
}

/**
 * Asks the corporate actions of every asset that has them and had a position
 * at some moment, since the domain only proposes what a position would feel:
 * the B3's stocks and funds by their ISIN, the American stocks by the ticker.
 */
function refreshCorporateActions(state: PortfolioState, sources: Sources, now: IsoDateTime, force: boolean): Promise<PortfolioCommand[]> {
  const due = state.assets.filter(
    (a) => hasCorporateActions(a.assetClass) && (a.assetClass === "international-stocks" || a.sourceId) && hadPosition(state, a),
  );
  return refreshAnnounced<SourceCorporateAction>(
    state,
    due,
    "corporate-actions",
    (a) => sources.corporateActions(a),
    (actions) => ({ type: "record-source-corporate-actions", actions }),
    now,
    force,
  );
}

/**
 * Asks each due asset what its source announced, when the last fetch of that
 * kind is more than a day old or when forced, and records it all in one
 * command. A failure is silent: what came is recorded, but the fetch only
 * counts when every asset answered, so the next opening asks again.
 */
async function refreshAnnounced<T>(
  state: PortfolioState,
  due: Asset[],
  kind: Exclude<FetchKind, "quotes">,
  ask: (asset: Asset) => Promise<Omit<T, "asset">[]>,
  record: (announced: T[]) => PortfolioCommand,
  now: IsoDateTime,
  force: boolean,
): Promise<PortfolioCommand[]> {
  if (!force && !isOld(state.lastFetch[kind], now, FRESH_ANNOUNCED_MINUTES)) return [];
  if (due.length === 0) return [];

  const answers = await Promise.allSettled(due.map(ask));
  const announced: T[] = [];
  answers.forEach((answer, i) => {
    if (answer.status === "fulfilled") announced.push(...answer.value.map((x) => ({ asset: due[i]!.id, ...x }) as T));
    else console.warn(`No ${kind} for ${due[i]!.ticker}:`, answer.reason);
  });

  const failed = answers.some((a) => a.status === "rejected");
  if (failed && announced.length === 0) return [];
  const recorded = record(announced);
  return failed ? [recorded] : [recorded, { type: "record-fetch", kind, at: now }];
}

/** The current exchange rate with the time of now, or null when the source fails. */
async function fetchRate(sources: Sources, now: IsoDateTime): Promise<CurrentExchangeRate | null> {
  try {
    return { rate: await sources.currentExchangeRate(), at: now };
  } catch (error) {
    console.warn("No current exchange rate:", error);
    return null;
  }
}

/** The classes a source quotes; fixed income has no quote from any source. */
const QUOTED_CLASSES: readonly AssetClass[] = ["domestic-stocks", "international-stocks", "real-estate-funds", "crypto"];

const hasSource = (a: Asset) => QUOTED_CLASSES.includes(a.assetClass);

/** The classes whose payouts the B3 brings; the others' are entered by hand. */
const PAYING_CLASSES: readonly AssetClass[] = ["domestic-stocks", "real-estate-funds"];

const hadPosition = (state: PortfolioState, a: Asset) => state.trades.some((t) => t.asset === a.id);

/** Whether what was obtained at that time, or never, is to be fetched again. */
const isOld = (at: IsoDateTime | undefined, now: IsoDateTime, freshMinutes = FRESH_MINUTES) => !at || minutesBetween(at, now) > freshMinutes;
