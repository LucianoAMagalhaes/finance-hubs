import { coinGeckoQuote } from "./coingecko";
import { SourceError, type Sources } from "./port";
import { yahooQuote } from "./yahoo";

/** The port answered by the real sources: Yahoo for the B3's classes, CoinGecko for crypto. */
export function liveSources(fetchFn: typeof fetch = fetch): Sources {
  return {
    latestQuote(asset) {
      switch (asset.assetClass) {
        case "domestic-stocks":
        case "real-estate-funds":
          return yahooQuote(asset, fetchFn);
        case "crypto":
          return coinGeckoQuote(asset, fetchFn);
        default:
          return Promise.reject(new SourceError(`No source quotes ${asset.assetClass}.`));
      }
    },
  };
}
