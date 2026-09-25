import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decimal } from "@/portfolio/domain";
import { coinGeckoQuote, SourceError, yahooQuote } from "@/portfolio/sources";

// Real answers recorded in files: the suite never touches the network.
const recorded = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("the Yahoo adapter", () => {
  it("reads the last price of a B3 stock from the chart's JSON, asking by the .SA symbol", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-petr4.json"));

    expect(await yahooQuote({ ticker: "PETR4", assetClass: "domestic-stocks" }, fetch)).toBe(decimal(48.06));
    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/PETR4.SA?interval=1d&range=1d"]);
  });

  it("reads a FII the same way", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-hglg11.json"));

    expect(await yahooQuote({ ticker: "HGLG11", assetClass: "real-estate-funds" }, fetch)).toBe(decimal(147.83));
    expect(fetch.asked[0]).toContain("/chart/HGLG11.SA?");
  });

  it("an unknown ticker, an error status, a changed format or a network failure is a failure, never an empty quote", async () => {
    const asset = { ticker: "XPTO99", assetClass: "domestic-stocks" } as const;

    await expect(yahooQuote(asset, fakeFetch(recorded("yahoo-chart-not-found.json"), 404))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, fakeFetch("Too Many Requests", 429))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, fakeFetch('{"chart":{"result":[{"meta":{}}]}}'))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, fakeFetch("<html>"))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the CoinGecko adapter", () => {
  it("reads the price in reais, with no key, asking by the ticker as a symbol", async () => {
    const fetch = fakeFetch(recorded("coingecko-price-btc.json"));

    expect(await coinGeckoQuote({ ticker: "BTC", assetClass: "crypto" }, fetch)).toBe(decimal(435_401));
    expect(fetch.asked).toEqual(["https://api.coingecko.com/api/v3/simple/price?symbols=btc&vs_currencies=brl"]);
  });

  it("keeps a price below a cent to the eighth place", async () => {
    const fetch = fakeFetch('{"shib":{"brl":0.00006412}}');

    expect(await coinGeckoQuote({ ticker: "SHIB", assetClass: "crypto" }, fetch)).toBe(6412);
  });

  it("a price that rounds to nothing at the eighth place is a failure, not a zero quote", async () => {
    await expect(coinGeckoQuote({ ticker: "DUST", assetClass: "crypto" }, fakeFetch('{"dust":{"brl":0.000000001}}'))).rejects.toThrow(
      SourceError,
    );
  });

  it("an unknown ticker, an error status or a network failure is a failure, never an empty quote", async () => {
    const asset = { ticker: "XPTOXX", assetClass: "crypto" } as const;

    await expect(coinGeckoQuote(asset, fakeFetch(recorded("coingecko-price-unknown.json")))).rejects.toThrow(SourceError);
    await expect(coinGeckoQuote(asset, fakeFetch('{"status":{"error_code":429}}', 429))).rejects.toThrow(SourceError);
    await expect(coinGeckoQuote(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

// ---------------------------------------------------------------- helpers

/** A fetch that answers every request with that body and status, and remembers the URLs asked. */
function fakeFetch(body: string, status = 200): typeof fetch & { asked: string[] } {
  const asked: string[] = [];
  const f = async (input: string | URL | Request) => {
    asked.push(String(input));
    return new Response(body, { status });
  };
  return Object.assign(f, { asked }) as typeof fetch & { asked: string[] };
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}
