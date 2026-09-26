import type { Decimal, ExchangeRate, Ratio } from "@/portfolio/domain";
import { isValidDate } from "@/shared";
import { getJson, priceFrom, rateFrom } from "./http";
import { SourceError, type AnnouncedCorporateAction, type SourcedAsset } from "./port";

// Yahoo Finance's chart JSON, with no key. Not an official API, and its terms
// forbid automated access: a risk accepted in the map (#59), which is why it
// sits behind this adapter.

/** The asset as Yahoo names it: the B3's tickers take ".SA", the American ones are bare. */
const symbolOf = ({ ticker, assetClass }: SourcedAsset) => (assetClass === "international-stocks" ? ticker : `${ticker}.SA`);

/** The dollar in reais, as Yahoo quotes it. */
const DOLLAR_IN_REAIS = "USDBRL=X";

const chartUrl = (symbol: string) =>
  `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

// Without a browser-like agent, Yahoo answers 429.
const HEADERS = { "User-Agent": "Mozilla/5.0" };

/** The last price of the asset, from `chart.result[0].meta.regularMarketPrice`. */
export async function yahooQuote(asset: SourcedAsset, fetchFn: typeof fetch = fetch): Promise<Decimal> {
  const symbol = symbolOf(asset);
  const answer = (await getJson(chartUrl(symbol), fetchFn, HEADERS)) as YahooChart;
  return priceFrom(answer?.chart?.result?.[0]?.meta?.regularMarketPrice, `Yahoo ${symbol}`);
}

/** The current exchange rate: USDBRL=X's last price, in reais per dollar, to 4 places. */
export async function yahooExchangeRate(fetchFn: typeof fetch = fetch): Promise<ExchangeRate> {
  const answer = (await getJson(chartUrl(DOLLAR_IN_REAIS), fetchFn, HEADERS)) as YahooChart;
  return rateFrom(answer?.chart?.result?.[0]?.meta?.regularMarketPrice, `Yahoo ${DOLLAR_IN_REAIS}`);
}

/**
 * Whether Yahoo knows the ticker: its chart has a price. A 404 whose chart
 * says "Not Found" is a ticker Yahoo doesn't know; any other answer without a
 * price is a failure.
 */
export async function yahooTickerExists(asset: SourcedAsset, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const symbol = symbolOf(asset);
  const answer = (await getJson(chartUrl(symbol), fetchFn, HEADERS, [404])) as YahooChart;
  if (answer?.chart?.error?.code === "Not Found") return false;
  priceFrom(answer?.chart?.result?.[0]?.meta?.regularMarketPrice, `Yahoo ${symbol}`);
  return true;
}

/**
 * Every split of the American stock Yahoo has, from the chart's split events
 * over its whole history: "4:1" is 4 new for 1, 1 → 4, and "1:8" a reverse
 * split, 8 → 1, reduced to the smallest integers. Yahoo also adjusts a
 * spin-off as a split ("1281:1000"); the person dismisses it, since a spin-off
 * isn't a corporate action. The date is the ex date, in the exchange's time.
 */
export async function yahooCorporateActions(asset: SourcedAsset, fetchFn: typeof fetch = fetch): Promise<AnnouncedCorporateAction[]> {
  const symbol = symbolOf(asset);
  const where = `Yahoo splits ${symbol}`;
  const answer = (await getJson(splitsUrl(symbol), fetchFn, HEADERS)) as YahooChart;
  const result = answer?.chart?.result?.[0];
  if (!result?.meta) throw new SourceError(`${where}: no chart in the answer.`);
  const offset = typeof result.meta.gmtoffset === "number" ? result.meta.gmtoffset : 0;
  const splits = Object.values(result.events?.splits ?? {});

  return splits
    .map((split): AnnouncedCorporateAction => {
      const { date, numerator, denominator } = (split ?? {}) as Record<string, unknown>;
      if (typeof date !== "number") throw new SourceError(`${where}: a split with no date.`);
      const day = new Date((date + offset) * 1000).toISOString().slice(0, 10);
      if (!isValidDate(day)) throw new SourceError(`${where}: "${date}" isn't a date.`);
      const ratio = integerRatio(denominator, numerator, where);
      return { kind: ratio.to > ratio.from ? "split" : "reverse-split", date: day, ratio };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

const splitsUrl = (symbol: string) =>
  `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=3mo&range=max&events=split`;

/** Yahoo's from and to, which it sends as numbers ("2.0"), as the smallest two integers; anything else is a format failure. */
function integerRatio(from: unknown, to: unknown, where: string): Ratio {
  if (typeof from !== "number" || typeof to !== "number" || !(from > 0) || !(to > 0) || from === to) {
    throw new SourceError(`${where}: "${String(to)}:${String(from)}" isn't a split.`);
  }
  let scale = 1;
  while (!(Number.isInteger(from * scale) && Number.isInteger(to * scale)) && scale < 1e6) scale *= 10;
  const [f, t] = [Math.round(from * scale), Math.round(to * scale)];
  const divisor = gcd(f, t);
  return { from: f / divisor, to: t / divisor };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

type YahooChart = {
  chart?: {
    result?: { meta?: { regularMarketPrice?: unknown; gmtoffset?: unknown }; events?: { splits?: Record<string, unknown> } }[] | null;
    error?: { code?: unknown } | null;
  };
} | null;
