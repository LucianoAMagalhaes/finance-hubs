import { b3Isin } from "./b3";
import { coinGeckoQuote, coinGeckoSearch } from "./coingecko";
import { SourceError, type Sources } from "./port";
import { yahooQuote, yahooTickerExists } from "./yahoo";

/** The port answered by the real sources: Yahoo and the B3 for the B3's classes, CoinGecko for crypto. */
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
    tickerExists: (asset) => yahooTickerExists(asset, fetchFn),
    isin: (asset) => b3Isin(asset, fetchFn),
    searchCrypto: (ticker) => coinGeckoSearch(ticker, fetchFn),
  };
}
