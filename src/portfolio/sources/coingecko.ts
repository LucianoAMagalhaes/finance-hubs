import type { Decimal } from "@/portfolio/domain";
import { getJson, priceFrom } from "./http";
import type { SourcedAsset } from "./port";

// CoinGecko's public API, with no key, already in reais. It asks for the
// "Powered by CoinGecko" notice, which the screen shows.

/**
 * The last price of the crypto in reais. Asked by symbol, which CoinGecko
 * resolves to the coin with the largest market cap, until the registration
 * keeps the coin's CoinGecko id (#83).
 */
export async function coinGeckoQuote({ ticker }: SourcedAsset, fetchFn: typeof fetch = fetch): Promise<Decimal> {
  const symbol = ticker.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?symbols=${encodeURIComponent(symbol)}&vs_currencies=brl`;
  const answer = (await getJson(url, fetchFn)) as Record<string, { brl?: unknown } | undefined> | null;
  return priceFrom(answer?.[symbol]?.brl, `CoinGecko ${symbol}`);
}
