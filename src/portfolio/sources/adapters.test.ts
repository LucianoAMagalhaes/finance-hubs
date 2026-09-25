import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decimal } from "@/portfolio/domain";
import { b3Isin, coinGeckoQuote, coinGeckoSearch, SourceError, yahooQuote, yahooTickerExists } from "@/portfolio/sources";

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

describe("the Yahoo ticker check", () => {
  it("a ticker whose chart has a price exists", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-petr4.json"));

    expect(await yahooTickerExists({ ticker: "PETR4", assetClass: "domestic-stocks" }, fetch)).toBe(true);
    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/PETR4.SA?interval=1d&range=1d"]);
  });

  it("a ticker Yahoo answers Not Found for doesn't exist", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-not-found.json"), 404);

    expect(await yahooTickerExists({ ticker: "XPTO99", assetClass: "real-estate-funds" }, fetch)).toBe(false);
  });

  it("any other error, a changed format or a network failure is a failure, not an unknown ticker", async () => {
    const asset = { ticker: "PETR4", assetClass: "domestic-stocks" } as const;

    await expect(yahooTickerExists(asset, fakeFetch("Too Many Requests", 429))).rejects.toThrow(SourceError);
    await expect(yahooTickerExists(asset, fakeFetch("Not Found", 404))).rejects.toThrow(SourceError);
    await expect(yahooTickerExists(asset, fakeFetch('{"chart":{"result":[{"meta":{}}]}}'))).rejects.toThrow(SourceError);
    await expect(yahooTickerExists(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the B3's ISIN", () => {
  const petrobras = routedFetch({
    GetInitialCompanies: recorded("b3-companies-petr4.json"),
    GetDetail: recorded("b3-detail-petrobras.json"),
  });

  it("finds the company by the ticker, and its GetDetail gives each ticker's ISIN", async () => {
    expect(await b3Isin({ ticker: "PETR4", assetClass: "domestic-stocks" }, petrobras)).toBe("BRPETRACNPR6");
    expect(await b3Isin({ ticker: "PETR3", assetClass: "domestic-stocks" }, petrobras)).toBe("BRPETRACNOR9");
    expect(petrobras.asked.map(decodeB3)).toEqual([
      ["GetInitialCompanies", { language: "pt-br", pageNumber: 1, pageSize: 20, company: "PETR4" }],
      ["GetDetail", { codeCVM: "9512", language: "pt-br" }],
      ["GetInitialCompanies", { language: "pt-br", pageNumber: 1, pageSize: 20, company: "PETR3" }],
      ["GetDetail", { codeCVM: "9512", language: "pt-br" }],
    ]);
  });

  it("a ticker the B3 doesn't list among the companies, like an ETF, has no ISIN", async () => {
    const unknown = routedFetch({ GetInitialCompanies: recorded("b3-companies-unknown.json") });

    expect(await b3Isin({ ticker: "BOVA11", assetClass: "domestic-stocks" }, unknown)).toBeNull();
    expect(await b3Isin({ ticker: "PETR9", assetClass: "domestic-stocks" }, petrobras)).toBeNull();
  });

  it("a FII's ISIN is its quota's, read from the fund's supplement, never a subscription receipt's", async () => {
    const fetch = routedFetch({ GetListedSupplementFunds: recorded("b3-funds-supplement-hglg.json") });

    expect(await b3Isin({ ticker: "HGLG11", assetClass: "real-estate-funds" }, fetch)).toBe("BRHGLGCTF004");
    expect(fetch.asked.map(decodeB3)).toEqual([["GetListedSupplementFunds", { cnpj: "0", identifierFund: "HGLG", typeFund: 7 }]]);
  });

  it("a fund the B3 answers nothing for has no ISIN", async () => {
    expect(await b3Isin({ ticker: "XPTO11", assetClass: "real-estate-funds" }, fakeFetch(""))).toBeNull();
  });

  it("an error status, a changed format or a network failure is a failure", async () => {
    const asset = { ticker: "PETR4", assetClass: "domestic-stocks" } as const;

    await expect(b3Isin(asset, fakeFetch("Service Unavailable", 503))).rejects.toThrow(SourceError);
    await expect(b3Isin(asset, fakeFetch('{"page":{}}'))).rejects.toThrow(SourceError);
    await expect(b3Isin({ ticker: "HGLG11", assetClass: "real-estate-funds" }, fakeFetch("<html>"))).rejects.toThrow(SourceError);
    await expect(b3Isin(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the CoinGecko search", () => {
  it("brings the coins whose symbol is the ticker, with name and market cap rank", async () => {
    const fetch = fakeFetch(recorded("coingecko-search-btc.json"));

    expect(await coinGeckoSearch("btc", fetch)).toEqual([{ id: "bitcoin", name: "Bitcoin", rank: 1 }]);
    expect(fetch.asked).toEqual(["https://api.coingecko.com/api/v3/search?query=BTC"]);
  });

  it("brings every coin sharing the symbol, in CoinGecko's order", async () => {
    expect(await coinGeckoSearch("PEPE", fakeFetch(recorded("coingecko-search-pepe.json")))).toEqual([
      { id: "pepe", name: "Pepe", rank: 54 },
      { id: "based-pepe", name: "Based Pepe", rank: 2110 },
      { id: "pepe-sol", name: "Pepe on SOL", rank: 2866 },
      { id: "pepecoin-on-solana", name: "PepeCoin on Solana", rank: 3335 },
    ]);
  });

  it("a coin with no rank comes with none", async () => {
    const answer = '{"coins":[{"id":"new-coin","name":"New Coin","symbol":"NEW","market_cap_rank":null}]}';

    expect(await coinGeckoSearch("NEW", fakeFetch(answer))).toEqual([{ id: "new-coin", name: "New Coin", rank: null }]);
  });

  it("a ticker CoinGecko doesn't know brings no coin", async () => {
    expect(await coinGeckoSearch("XPTOXX", fakeFetch(recorded("coingecko-search-unknown.json")))).toEqual([]);
  });

  it("an error status, a changed format or a network failure is a failure, not an unknown ticker", async () => {
    await expect(coinGeckoSearch("BTC", fakeFetch('{"status":{"error_code":429}}', 429))).rejects.toThrow(SourceError);
    await expect(coinGeckoSearch("BTC", fakeFetch('{"status":{}}'))).rejects.toThrow(SourceError);
    await expect(coinGeckoSearch("BTC", failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the CoinGecko adapter", () => {
  it("reads the price in reais, with no key, asking by the ticker as a symbol", async () => {
    const fetch = fakeFetch(recorded("coingecko-price-btc.json"));

    expect(await coinGeckoQuote({ ticker: "BTC", assetClass: "crypto" }, fetch)).toBe(decimal(435_401));
    expect(fetch.asked).toEqual(["https://api.coingecko.com/api/v3/simple/price?symbols=btc&vs_currencies=brl"]);
  });

  it("asks by the coin's id once the registration kept it", async () => {
    const fetch = fakeFetch(recorded("coingecko-price-bitcoin-by-id.json"));

    expect(await coinGeckoQuote({ ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" }, fetch)).toBe(decimal(435_932));
    expect(fetch.asked).toEqual(["https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl"]);
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

/** A fetch that answers each B3 call by its name in the URL, 404 for the others, and remembers the URLs asked. */
function routedFetch(bodies: Record<string, string>): typeof fetch & { asked: string[] } {
  const asked: string[] = [];
  const f = async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const call = Object.keys(bodies).find((name) => url.includes(`/${name}/`));
    return call ? new Response(bodies[call]) : new Response("Not Found", { status: 404 });
  };
  return Object.assign(f, { asked }) as typeof fetch & { asked: string[] };
}

/** The B3's call and the JSON it carries in Base64 at the end of the URL. */
function decodeB3(url: string): [string, unknown] {
  const [call, encoded] = url.split("/").slice(-2) as [string, string];
  return [call, JSON.parse(Buffer.from(decodeURIComponent(encoded), "base64").toString("utf8"))];
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}
