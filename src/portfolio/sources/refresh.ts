import {
  currencyOf,
  minutesBetween,
  type Asset,
  type AssetClass,
  type CurrentExchangeRate,
  type IsoDateTime,
  type PortfolioCommand,
  type PortfolioState,
  type QuoteToRecord,
} from "@/portfolio/domain";
import type { Sources } from "./port";

/** A quote or a current exchange rate obtained more than this many minutes ago is fetched again. */
const FRESH_MINUTES = 15;

/**
 * Decides what to fetch and turns what the sources bring into commands; it
 * never writes. Fetches the quotes older than 15 minutes, and by the same rule
 * the current exchange rate while an asset is in dollars, or all of them when
 * forced. A source that fails doesn't stop the others: its asset keeps its
 * last quote, and the portfolio its last rate. The fetch of quotes counts as
 * successful when any quote came: a rate alone keeps only its own time.
 */
export async function refresh(state: PortfolioState, sources: Sources, now: IsoDateTime, force: boolean): Promise<PortfolioCommand[]> {
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

/** Whether what was obtained at that time, or never, is to be fetched again. */
const isOld = (at: IsoDateTime | undefined, now: IsoDateTime) => !at || minutesBetween(at, now) > FRESH_MINUTES;
