import { normalizeTicker, type Decimal } from "@/portfolio/domain";
import { getJson, priceFrom } from "./http";
import { SourceError, type CryptoCandidate, type SourcedAsset } from "./port";

// CoinGecko's public API, with no key, already in reais. It asks for the
// "Powered by CoinGecko" notice, which the screen shows.

const API = "https://api.coingecko.com/api/v3";

/**
 * The last price of the crypto in reais, asked by the coin's CoinGecko id. An
 * asset registered before the id was kept is asked by symbol, which CoinGecko
 * resolves to the coin with the largest market cap.
 */
export async function coinGeckoQuote({ ticker, sourceId }: SourcedAsset, fetchFn: typeof fetch = fetch): Promise<Decimal> {
  const [param, key] = sourceId ? ["ids", sourceId] : ["symbols", ticker.toLowerCase()];
  const url = `${API}/simple/price?${param}=${encodeURIComponent(key)}&vs_currencies=brl`;
  const answer = (await getJson(url, fetchFn)) as Record<string, { brl?: unknown } | undefined> | null;
  return priceFrom(answer?.[key]?.brl, `CoinGecko ${key}`);
}

/**
 * The coins whose symbol is the ticker, in CoinGecko's order, from its search.
 * None is a ticker CoinGecko doesn't know.
 */
export async function coinGeckoSearch(ticker: string, fetchFn: typeof fetch = fetch): Promise<CryptoCandidate[]> {
  const symbol = normalizeTicker(ticker);
  const answer = (await getJson(`${API}/search?query=${encodeURIComponent(symbol)}`, fetchFn)) as CoinGeckoSearch;
  const coins = answer?.coins;
  if (!Array.isArray(coins)) throw new SourceError(`CoinGecko search ${symbol}: no coins in the answer.`);
  return coins
    .filter((c) => typeof c?.id === "string" && typeof c.symbol === "string" && c.symbol.toUpperCase() === symbol)
    .map((c) => ({
      id: c.id as string,
      name: typeof c.name === "string" ? c.name : (c.id as string),
      rank: typeof c.market_cap_rank === "number" ? c.market_cap_rank : null,
    }));
}

type CoinGeckoSearch = { coins?: { id?: unknown; name?: unknown; symbol?: unknown; market_cap_rank?: unknown }[] } | null;
