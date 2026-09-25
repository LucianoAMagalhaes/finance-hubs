import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  exchangeRate,
  type AssetClass,
  type Decimal,
  type ExchangeRate,
  type IsoDateTime,
  type PortfolioCommand,
  type PortfolioState,
} from "@/portfolio/domain";
import { refresh, SourceError, type Sources } from "@/portfolio/sources";

const NOW: IsoDateTime = "2026-09-25T14:32:00";

describe("refreshing the quotes", () => {
  it("fetches every asset that never had a quote, and records them with the time of now", async () => {
    const state = withAssets(["PETR4", "domestic-stocks"], ["HGLG11", "real-estate-funds"], ["BTC", "crypto"]);
    const sources = fakeSources({ PETR4: decimal(36.8), HGLG11: decimal(147.83), BTC: decimal(435_401) });

    const commands = await refresh(state, sources, NOW, false);

    expect(sources.asked).toEqual(["PETR4", "HGLG11", "BTC"]);
    expect(commands).toEqual([
      {
        type: "record-quotes",
        quotes: [
          { asset: 1, price: decimal(36.8), at: NOW },
          { asset: 2, price: decimal(147.83), at: NOW },
          { asset: 3, price: decimal(435_401), at: NOW },
        ],
      },
      { type: "record-fetch", kind: "quotes", at: NOW },
    ]);
  });

  it("fetches only the quotes older than 15 minutes, and skips the others", async () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"], ["VALE3", "domestic-stocks"], ["BTC", "crypto"]),
      recordQuotes([1, "2026-09-25T14:17:00"], [2, "2026-09-25T14:16:59"], [3, "2026-09-24T18:00:00"]),
    );
    const sources = fakeSources({ PETR4: decimal(37), VALE3: decimal(61), BTC: decimal(436_000) });

    const commands = await refresh(state, sources, NOW, false);

    expect(sources.asked).toEqual(["VALE3", "BTC"]);
    expect(commands[0]).toEqual({
      type: "record-quotes",
      quotes: [
        { asset: 2, price: decimal(61), at: NOW },
        { asset: 3, price: decimal(436_000), at: NOW },
      ],
    });
  });

  it("with every quote fresh, asks nothing and returns nothing", async () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), recordQuotes([1, "2026-09-25T14:20:00"]));
    const sources = fakeSources({ PETR4: decimal(37) });

    expect(await refresh(state, sources, NOW, false)).toEqual([]);
    expect(sources.asked).toEqual([]);
  });

  it("forced, fetches every quote, however fresh", async () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"], ["BTC", "crypto"]), recordQuotes([1, "2026-09-25T14:31:00"], [2, NOW]));
    const sources = fakeSources({ PETR4: decimal(37), BTC: decimal(436_000) });

    const commands = await refresh(state, sources, NOW, true);

    expect(sources.asked).toEqual(["PETR4", "BTC"]);
    expect(commands).toHaveLength(2);
  });

  it("a fixed income asset has no source to ask", async () => {
    const state = { ...withAssets(["PETR4", "domestic-stocks"]), assets: [{ id: 1, ticker: "TESOURO", assetClass: "fixed-income" as const, sourceId: null }] };
    const sources = fakeSources({});

    expect(await refresh(state, sources, NOW, true)).toEqual([]);
    expect(sources.asked).toEqual([]);
  });

  it("a source that fails doesn't stop the others, and the failed asset keeps its last quote, with its time", async () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"], ["BTC", "crypto"]), recordQuotes([2, "2026-09-24T18:00:00"]));
    const sources = fakeSources({ PETR4: decimal(37), BTC: new SourceError("CoinGecko didn't answer.") });

    const commands = await refresh(state, sources, NOW, false);

    expect(sources.asked).toEqual(["PETR4", "BTC"]);
    expect(commands).toEqual([
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(37), at: NOW }] },
      { type: "record-fetch", kind: "quotes", at: NOW },
    ]);
    const after = run(state, ...commands);
    expect(after.quotes.find((q) => q.asset === 2)).toEqual({ asset: 2, price: decimal(400_000), at: "2026-09-24T18:00:00" });
  });

  it("when every source fails, returns nothing, and an unexpected error is a failure too", async () => {
    const state = withAssets(["PETR4", "domestic-stocks"], ["BTC", "crypto"]);
    const sources = fakeSources({ PETR4: new TypeError("fetch failed"), BTC: new SourceError("CoinGecko didn't answer.") });

    expect(await refresh(state, sources, NOW, true)).toEqual([]);
  });
});

describe("refreshing the current exchange rate", () => {
  it("with an asset in dollars, fetches its quote by Yahoo and the rate with it, in the same commands", async () => {
    const state = withAssets(["KO", "international-stocks"]);
    const sources = fakeSources({ KO: decimal(87.645) }, exchangeRate(5.1885));

    const commands = await refresh(state, sources, NOW, false);

    expect(sources.asked).toEqual(["KO", "USDBRL=X"]);
    expect(commands).toEqual([
      {
        type: "record-quotes",
        quotes: [{ asset: 1, price: decimal(87.645), at: NOW }],
        exchangeRate: { rate: exchangeRate(5.1885), at: NOW },
      },
      { type: "record-fetch", kind: "quotes", at: NOW },
    ]);
  });

  it("without an asset in dollars, the rate is not asked", async () => {
    const sources = fakeSources({ PETR4: decimal(37) }, exchangeRate(5.1885));

    await refresh(withAssets(["PETR4", "domestic-stocks"]), sources, NOW, true);

    expect(sources.asked).toEqual(["PETR4"]);
  });

  it("follows the 15 minutes' rule like a quote, and forced fetches it however fresh", async () => {
    const fresh = run(withAssets(["KO", "international-stocks"]), recordQuotes([1, "2026-09-25T14:20:00"]), recordRate("2026-09-25T14:20:00"));
    const old = run(fresh, recordRate("2026-09-25T14:16:59"));

    const onlyRate = fakeSources({}, exchangeRate(5.2));
    // A rate alone doesn't move the time of the quotes.
    expect(await refresh(old, onlyRate, NOW, false)).toEqual([
      { type: "record-quotes", quotes: [], exchangeRate: { rate: exchangeRate(5.2), at: NOW } },
    ]);
    expect(onlyRate.asked).toEqual(["USDBRL=X"]);

    const none = fakeSources({}, exchangeRate(5.2));
    expect(await refresh(fresh, none, NOW, false)).toEqual([]);
    expect(none.asked).toEqual([]);

    const forced = fakeSources({ KO: decimal(88) }, exchangeRate(5.2));
    await refresh(fresh, forced, NOW, true);
    expect(forced.asked).toEqual(["KO", "USDBRL=X"]);
  });

  it("a rate that fails doesn't stop the quotes, and the last rate keeps counting", async () => {
    const state = run(withAssets(["KO", "international-stocks"]), recordRate("2026-09-24T18:00:00"));
    const sources = fakeSources({ KO: decimal(88) }, new SourceError("Yahoo didn't answer."));

    const commands = await refresh(state, sources, NOW, false);

    expect(commands[0]).toEqual({ type: "record-quotes", quotes: [{ asset: 1, price: decimal(88), at: NOW }] });
    expect(run(state, ...commands).exchangeRate).toEqual({ rate: exchangeRate(5.3), at: "2026-09-24T18:00:00" });
  });
});

// ---------------------------------------------------------------- helpers

/**
 * A port that answers each ticker from the table, and the current exchange
 * rate with `rate`, or fails with their error, and remembers what it was asked.
 */
function fakeSources(answers: Record<string, Decimal | Error>, rate: ExchangeRate | Error = new Error("Nobody asked for the rate.")): Sources & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async latestQuote({ ticker }) {
      asked.push(ticker);
      const answer = answers[ticker];
      if (answer === undefined) throw new Error(`Nobody asked for ${ticker}.`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async currentExchangeRate() {
      asked.push("USDBRL=X");
      if (rate instanceof Error) throw rate;
      return rate;
    },
    tickerExists: notAsked,
    isin: notAsked,
    searchCrypto: notAsked,
    sellingPtax: notAsked,
  };
}

async function notAsked(): Promise<never> {
  throw new Error("The refresh only asks for quotes and the current exchange rate.");
}

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  return run(emptyPortfolio(), ...assets.map(([ticker, assetClass]): PortfolioCommand => ({ type: "save-asset", asset: { ticker, assetClass } })));
}

/** Quotes of R$ 400.000 for each asset, obtained at the given times. */
const recordQuotes = (...quotes: [number, string][]): PortfolioCommand => ({
  type: "record-quotes",
  quotes: quotes.map(([asset, at]) => ({ asset, price: decimal(400_000), at: at as IsoDateTime })),
});

/** A current exchange rate of R$ 5,30, obtained at the given time. */
const recordRate = (at: string): PortfolioCommand => ({
  type: "record-quotes",
  quotes: [],
  exchangeRate: { rate: exchangeRate(5.3), at: at as IsoDateTime },
});

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  return commands.reduce((s, command) => {
    const result = apply(s, command, "2026-09-25");
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, state);
}
