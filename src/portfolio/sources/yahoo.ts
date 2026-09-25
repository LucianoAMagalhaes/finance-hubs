import type { Decimal } from "@/portfolio/domain";
import { getJson, priceFrom } from "./http";
import type { SourcedAsset } from "./port";

// Yahoo Finance's chart JSON, with no key. Not an official API, and its terms
// forbid automated access: a risk accepted in the map (#59), which is why it
// sits behind this adapter.

/** The asset as Yahoo names it: the B3's tickers take ".SA". */
const symbolOf = ({ ticker }: SourcedAsset) => `${ticker}.SA`;

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

type YahooChart = {
  chart?: { result?: { meta?: { regularMarketPrice?: unknown } }[] | null; error?: { code?: unknown } | null };
} | null;
