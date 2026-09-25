import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  type AssetClass,
  type Decimal,
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

// ---------------------------------------------------------------- helpers

/** A port that answers each ticker from the table, or fails with its error, and remembers what it was asked. */
function fakeSources(answers: Record<string, Decimal | Error>): Sources & { asked: string[] } {
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
    tickerExists: notAsked,
    isin: notAsked,
    searchCrypto: notAsked,
  };
}

async function notAsked(): Promise<never> {
  throw new Error("The refresh only asks for quotes.");
}

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  return run(emptyPortfolio(), ...assets.map(([ticker, assetClass]): PortfolioCommand => ({ type: "save-asset", asset: { ticker, assetClass } })));
}

/** Quotes of R$ 400.000 for each asset, obtained at the given times. */
const recordQuotes = (...quotes: [number, string][]): PortfolioCommand => ({
  type: "record-quotes",
  quotes: quotes.map(([asset, at]) => ({ asset, price: decimal(400_000), at: at as IsoDateTime })),
});

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  return commands.reduce((s, command) => {
    const result = apply(s, command, "2026-09-25");
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, state);
}
