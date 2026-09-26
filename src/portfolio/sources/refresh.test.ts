import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  exchangeRate,
  type AssetClass,
  type Decimal,
  type ExchangeRate,
  type IsoDate,
  type IsoDateTime,
  type PortfolioCommand,
  type PortfolioState,
} from "@/portfolio/domain";
import { refresh, SourceError, type AnnouncedCorporateAction, type AnnouncedPayout, type Sources } from "@/portfolio/sources";

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

describe("refreshing the payouts", () => {
  it("asks the B3 stocks and funds that had a position, by their ISIN, and records what came with the time of the fetch", async () => {
    const state = run(
      withIsins(["PETR4", "domestic-stocks", "BRPETRACNPR6"], ["HGLG11", "real-estate-funds", "BRHGLGCTF004"]),
      buy(1, "2026-08-01"),
      buy(2, "2026-08-01"),
      recordQuotes([1, NOW], [2, NOW]),
    );
    const sources = fakeSources({}, undefined, { PETR4: [dividend], HGLG11: [fundIncome] });

    const commands = await refresh(state, sources, NOW, false);

    expect(sources.asked).toEqual(["payouts PETR4 BRPETRACNPR6", "payouts HGLG11 BRHGLGCTF004"]);
    expect(commands).toEqual([
      { type: "record-source-payouts", payouts: [{ asset: 1, ...dividend }, { asset: 2, ...fundIncome }] },
      { type: "record-fetch", kind: "payouts", at: NOW },
    ]);
    expect(run(state, ...commands).payouts.map((p) => [p.asset, p.date, p.amount])).toEqual([
      [1, "2026-09-21", 4_716],
      [2, "2026-09-15", 11_700],
    ]);
  });

  it("only asks the assets that had a position at some moment, and only in the B3's classes with an ISIN", async () => {
    const state = run(
      withIsins(
        ["PETR4", "domestic-stocks", "BRPETRACNPR6"],
        ["VALE3", "domestic-stocks", "BRVALEACNOR0"],
        ["BOVA11", "domestic-stocks", null],
        ["KO", "international-stocks", null],
        ["BTC", "crypto", "bitcoin"],
      ),
      buy(1, "2026-08-01"),
      sell(1, "2026-08-10"),
      buy(3, "2026-08-01"),
      buy(4, "2026-08-01", 10, 50, 50_000),
      buy(5, "2026-08-01"),
      recordQuotes([1, NOW], [2, NOW], [3, NOW], [4, NOW], [5, NOW]),
      recordRate(NOW),
    );
    const sources = fakeSources({}, undefined, { PETR4: [] });

    const commands = await refresh(state, sources, NOW, false);

    expect(sources.asked).toEqual(["payouts PETR4 BRPETRACNPR6"]);
    expect(commands).toEqual([
      { type: "record-source-payouts", payouts: [] },
      { type: "record-fetch", kind: "payouts", at: NOW },
    ]);
  });

  it("asks again only after more than a day, and forced asks however fresh", async () => {
    const fetched = (at: string) =>
      run(withIsins(["PETR4", "domestic-stocks", "BRPETRACNPR6"]), buy(1, "2026-08-01"), recordQuotes([1, NOW]), {
        type: "record-fetch",
        kind: "payouts",
        at: at as IsoDateTime,
      });

    const fresh = fakeSources({}, undefined, { PETR4: [] });
    expect(await refresh(fetched("2026-09-24T14:32:00"), fresh, NOW, false)).toEqual([]);
    expect(fresh.asked).toEqual([]);

    const old = fakeSources({}, undefined, { PETR4: [] });
    await refresh(fetched("2026-09-24T14:31:59"), old, NOW, false);
    expect(old.asked).toEqual(["payouts PETR4 BRPETRACNPR6"]);

    const forced = fakeSources({ PETR4: decimal(37) }, undefined, { PETR4: [] });
    await refresh(fetched("2026-09-25T14:00:00"), forced, NOW, true);
    expect(forced.asked).toEqual(["PETR4", "payouts PETR4 BRPETRACNPR6"]);
  });

  it("a failure is silent: what came is recorded, but the fetch isn't, so the next opening asks again", async () => {
    const state = run(
      withIsins(["PETR4", "domestic-stocks", "BRPETRACNPR6"], ["HGLG11", "real-estate-funds", "BRHGLGCTF004"]),
      buy(1, "2026-08-01"),
      buy(2, "2026-08-01"),
      recordQuotes([1, NOW], [2, NOW]),
    );

    const oneFails = fakeSources({}, undefined, { PETR4: [dividend], HGLG11: new SourceError("The B3 didn't answer.") });
    expect(await refresh(state, oneFails, NOW, false)).toEqual([{ type: "record-source-payouts", payouts: [{ asset: 1, ...dividend }] }]);

    const allFail = fakeSources({}, undefined, { PETR4: new TypeError("fetch failed"), HGLG11: new SourceError("The B3 didn't answer.") });
    expect(await refresh(state, allFail, NOW, false)).toEqual([]);
  });

  it("a failure of the payouts doesn't stop the quotes", async () => {
    const state = run(withIsins(["PETR4", "domestic-stocks", "BRPETRACNPR6"]), buy(1, "2026-08-01"));
    const sources = fakeSources({ PETR4: decimal(37) }, undefined, { PETR4: new SourceError("The B3 didn't answer.") });

    expect(await refresh(state, sources, NOW, false)).toEqual([
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(37), at: NOW }] },
      { type: "record-fetch", kind: "quotes", at: NOW },
    ]);
  });
});

describe("refreshing the corporate actions", () => {
  it("asks the assets that have them and had a position, the B3's by their ISIN and the American by the ticker, and records what came", async () => {
    const state = run(
      withIsins(
        ["PETR4", "domestic-stocks", "BRPETRACNPR6"],
        ["HGLG11", "real-estate-funds", "BRHGLGCTF004"],
        ["AAPL", "international-stocks", null],
        ["BOVA11", "domestic-stocks", null],
        ["VALE3", "domestic-stocks", "BRVALEACNOR0"],
        ["BTC", "crypto", "bitcoin"],
      ),
      buy(1, "2026-01-10"),
      sell(1, "2026-02-10"),
      buy(2, "2026-01-10"),
      buy(3, "2026-01-10", 10, 200, 50_000),
      buy(4, "2026-01-10"),
      buy(6, "2026-01-10"),
      recordQuotes([1, NOW], [2, NOW], [3, NOW], [4, NOW], [5, NOW], [6, NOW]),
      recordRate(NOW),
      { type: "record-fetch", kind: "payouts", at: NOW },
    );
    const sources = fakeSources({}, undefined, {}, { PETR4: [], HGLG11: [split], AAPL: [reverseSplit] });

    const commands = await refresh(state, sources, NOW, false);

    expect(sources.askedActions).toEqual(["PETR4 BRPETRACNPR6", "HGLG11 BRHGLGCTF004", "AAPL null"]);
    expect(commands).toEqual([
      { type: "record-source-corporate-actions", actions: [{ asset: 2, ...split }, { asset: 3, ...reverseSplit }] },
      { type: "record-fetch", kind: "corporate-actions", at: NOW },
    ]);
    expect(run(state, ...commands).corporateActions.map((c) => [c.asset, c.date, c.status])).toEqual([
      [2, "2026-03-10", "pending"],
      [3, "2026-04-10", "pending"],
    ]);
  });

  it("asks again only after more than a day, and forced asks however fresh", async () => {
    const fetched = (at: string) =>
      run(withAssets(["AAPL", "international-stocks"]), buy(1, "2026-01-10", 10, 200, 50_000), recordQuotes([1, NOW]), recordRate(NOW), {
        type: "record-fetch",
        kind: "corporate-actions",
        at: at as IsoDateTime,
      });

    const fresh = fakeSources({}, undefined, {}, { AAPL: [] });
    expect(await refresh(fetched("2026-09-24T14:32:00"), fresh, NOW, false)).toEqual([]);
    expect(fresh.askedActions).toEqual([]);

    const old = fakeSources({}, undefined, {}, { AAPL: [] });
    await refresh(fetched("2026-09-24T14:31:59"), old, NOW, false);
    expect(old.askedActions).toEqual(["AAPL null"]);

    const forced = fakeSources({ AAPL: decimal(200) }, exchangeRate(5.3), {}, { AAPL: [] });
    await refresh(fetched("2026-09-25T14:00:00"), forced, NOW, true);
    expect(forced.askedActions).toEqual(["AAPL null"]);
  });

  it("a failure is silent: what came is recorded, but the fetch isn't, so the next opening asks again", async () => {
    const state = run(
      withIsins(["PETR4", "domestic-stocks", "BRPETRACNPR6"], ["AAPL", "international-stocks", null]),
      buy(1, "2026-01-10"),
      buy(2, "2026-01-10", 10, 200, 50_000),
      recordQuotes([1, NOW], [2, NOW]),
      recordRate(NOW),
      { type: "record-fetch", kind: "payouts", at: NOW },
    );

    const oneFails = fakeSources({}, undefined, {}, { PETR4: new SourceError("The B3 didn't answer."), AAPL: [reverseSplit] });
    expect(await refresh(state, oneFails, NOW, false)).toEqual([{ type: "record-source-corporate-actions", actions: [{ asset: 2, ...reverseSplit }] }]);

    const allFail = fakeSources({}, undefined, {}, { PETR4: new SourceError("The B3 didn't answer."), AAPL: new TypeError("fetch failed") });
    expect(await refresh(state, allFail, NOW, false)).toEqual([]);
  });

  it("a failure of the corporate actions doesn't stop the quotes", async () => {
    const state = run(withIsins(["PETR4", "domestic-stocks", "BRPETRACNPR6"]), buy(1, "2026-01-10"), { type: "record-fetch", kind: "payouts", at: NOW });
    const sources = fakeSources({ PETR4: decimal(37) }, undefined, {}, { PETR4: new SourceError("The B3 didn't answer.") });

    expect(await refresh(state, sources, NOW, false)).toEqual([
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(37), at: NOW }] },
      { type: "record-fetch", kind: "quotes", at: NOW },
    ]);
  });
});

// ---------------------------------------------------------------- helpers

/** HGLG11's split of 1 into 10. */
const split: AnnouncedCorporateAction = { kind: "split", date: "2026-03-10", ratio: { from: 1, to: 10 } };

/** A reverse split of 8 into 1. */
const reverseSplit: AnnouncedCorporateAction = { kind: "reverse-split", date: "2026-04-10", ratio: { from: 8, to: 1 } };

/** PETR4's dividend of R$ 0,47156696 per share, paid; R$ 47,16 for 100 shares. */
const dividend: AnnouncedPayout = { kind: "dividend", recordDate: "2026-08-21", paymentDate: "2026-09-21", perUnit: decimal(0.47156696) };

/** HGLG11's income of R$ 1,17 per quota, paid; R$ 117,00 for 100 quotas. */
const fundIncome: AnnouncedPayout = { kind: "fund-income", recordDate: "2026-08-31", paymentDate: "2026-09-15", perUnit: decimal(1.17) };

/**
 * A port that answers each ticker's quote, payouts and corporate actions from
 * the tables, and the current exchange rate with `rate`, or fails with their
 * error, and remembers what it was asked: the corporate actions apart.
 */
function fakeSources(
  answers: Record<string, Decimal | Error>,
  rate: ExchangeRate | Error = new Error("Nobody asked for the rate."),
  payouts: Record<string, AnnouncedPayout[] | Error> = {},
  actions: Record<string, AnnouncedCorporateAction[] | Error> = {},
): Sources & { asked: string[]; askedActions: string[] } {
  const asked: string[] = [];
  const askedActions: string[] = [];
  return {
    asked,
    askedActions,
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
    async payouts({ ticker, sourceId }) {
      asked.push(`payouts ${ticker} ${sourceId}`);
      const answer = payouts[ticker];
      if (answer === undefined) throw new Error(`Nobody asked for the payouts of ${ticker}.`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async corporateActions({ ticker, sourceId }) {
      askedActions.push(`${ticker} ${sourceId}`);
      const answer = actions[ticker];
      if (answer === undefined) throw new Error(`Nobody asked for the corporate actions of ${ticker}.`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    tickerExists: notAsked,
    isin: notAsked,
    searchCrypto: notAsked,
    sellingPtax: notAsked,
  };
}

async function notAsked(): Promise<never> {
  throw new Error("The refresh only asks for quotes, the current exchange rate, payouts and corporate actions.");
}

function withIsins(...assets: [string, AssetClass, string | null][]): PortfolioState {
  return run(
    emptyPortfolio(),
    ...assets.map(([ticker, assetClass, sourceId]): PortfolioCommand => ({ type: "save-asset", asset: { ticker, assetClass, sourceId } })),
  );
}

const trade =
  (kind: "buy" | "sell") =>
  (asset: number, date: string, quantity = 100, unitPrice = 30, rate?: ExchangeRate): PortfolioCommand => ({
    type: "save-trade",
    trade: { asset, kind, date: date as IsoDate, quantity: decimal(quantity), unitPrice: decimal(unitPrice), exchangeRate: rate },
  });
const buy = trade("buy");
const sell = trade("sell");

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
