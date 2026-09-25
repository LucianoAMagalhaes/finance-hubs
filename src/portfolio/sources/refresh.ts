import {
  minutesBetween,
  type Asset,
  type AssetClass,
  type IsoDateTime,
  type PortfolioCommand,
  type PortfolioState,
  type QuoteToRecord,
} from "@/portfolio/domain";
import type { Sources } from "./port";

/** A quote obtained more than this many minutes ago is fetched again. */
const QUOTE_FRESH_MINUTES = 15;

/**
 * Decides what to fetch and turns what the sources bring into commands; it
 * never writes. Fetches the quotes older than 15 minutes, or all of them when
 * forced. A source that fails doesn't stop the others: its asset keeps its last
 * quote, and the fetch counts as successful when any quote came.
 */
export async function refresh(state: PortfolioState, sources: Sources, now: IsoDateTime, force: boolean): Promise<PortfolioCommand[]> {
  const due = state.assets.filter((a) => hasSource(a) && (force || isOld(state, a, now)));
  if (due.length === 0) return [];

  const answers = await Promise.allSettled(due.map((a) => sources.latestQuote(a)));
  const quotes: QuoteToRecord[] = [];
  answers.forEach((answer, i) => {
    if (answer.status === "fulfilled") quotes.push({ asset: due[i]!.id, price: answer.value, at: now });
    else console.warn(`No quote for ${due[i]!.ticker}:`, answer.reason);
  });

  if (quotes.length === 0) return [];
  return [
    { type: "record-quotes", quotes },
    { type: "record-fetch", kind: "quotes", at: now },
  ];
}

/** The classes a source quotes; fixed income has no quote from any source. */
const QUOTED_CLASSES: readonly AssetClass[] = ["domestic-stocks", "real-estate-funds", "crypto"];

const hasSource = (a: Asset) => QUOTED_CLASSES.includes(a.assetClass);

function isOld(state: PortfolioState, a: Asset, now: IsoDateTime): boolean {
  const last = state.quotes.find((q) => q.asset === a.id);
  return !last || minutesBetween(last.at, now) > QUOTE_FRESH_MINUTES;
}
