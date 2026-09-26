import { b3Isin, b3Payouts } from "./b3";
import { bcbSellingPtax } from "./bcb";
import { coinGeckoQuote, coinGeckoSearch } from "./coingecko";
import { SourceError, type Sources } from "./port";
import { yahooExchangeRate, yahooQuote, yahooTickerExists } from "./yahoo";

/**
 * The port answered by the real sources: Yahoo and the B3 for the B3's
 * classes, Yahoo for the American stocks and the current exchange rate,
 * CoinGecko for crypto, the BCB for the PTAX, and the B3 for the payouts.
 */
export function liveSources(fetchFn: typeof fetch = fetch): Sources {
  return {
    latestQuote(asset) {
      switch (asset.assetClass) {
        case "domestic-stocks":
        case "international-stocks":
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
    currentExchangeRate: () => yahooExchangeRate(fetchFn),
    payouts: (asset) => b3Payouts(asset, fetchFn),
    sellingPtax: (date) => bcbSellingPtax(date, fetchFn),
  };
}
