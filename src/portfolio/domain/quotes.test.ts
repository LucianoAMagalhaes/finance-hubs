import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  projectPortfolio,
  type AssetClass,
  type AssetView,
  type IsoDate,
  type IsoDateTime,
  type PortfolioCommand,
  type PortfolioState,
  type QuoteToRecord,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25"; // a Friday

describe("recording quotes", () => {
  it("keeps only the last quote of each asset, with the time it was obtained", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"], ["BTC", "crypto"]),
      recordQuotes(quote(1, 36, "2026-09-25T10:00:00"), quote(2, 400_000, "2026-09-25T10:00:00")),
      recordQuotes(quote(1, 38.5, "2026-09-25T14:32:00")),
    );

    expect(state.quotes).toEqual([
      { asset: 1, price: decimal(38.5), at: "2026-09-25T14:32:00" },
      { asset: 2, price: decimal(400_000), at: "2026-09-25T10:00:00" },
    ]);
  });

  it("drops the quote of an asset deleted while the sources were asked", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), recordQuotes(quote(1, 36, "2026-09-25T10:00:00"), quote(7, 5, "2026-09-25T10:00:00")));

    expect(state.quotes.map((q) => q.asset)).toEqual([1]);
  });

  it("deleting an asset deletes its quote", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), recordQuotes(quote(1, 36, "2026-09-25T10:00:00")), { type: "delete-asset", id: 1 });

    expect(state.quotes).toEqual([]);
  });

  it("what comes from outside is checked whole: a price that is not positive, a bad time", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);

    expect(execute(state, recordQuotes({ asset: 1, price: 0, at: "2026-09-25T10:00:00" }))).toEqual({
      ok: false,
      error: "A cotação tem que ser maior que zero.",
    });
    expect(execute(state, recordQuotes({ asset: 1, price: 0.5, at: "2026-09-25T10:00:00" }))).toEqual({
      ok: false,
      error: "A cotação aceita até 8 casas decimais.",
    });
    expect(execute(state, recordQuotes(quote(1, 36, "2026-09-25 10:00" as IsoDateTime)))).toEqual({
      ok: false,
      error: "A cotação precisa da hora em que foi obtida.",
    });
  });

  it("records the time of the last successful fetch of quotes", () => {
    const state = run(emptyPortfolio(), { type: "record-fetch", kind: "quotes", at: "2026-09-25T14:32:00" });

    expect(state.lastFetch).toEqual({ quotes: "2026-09-25T14:32:00" });
    expect(projectPortfolio(state, TODAY).quotesAt).toBe("2026-09-25T14:32:00");
    expect(projectPortfolio(emptyPortfolio(), TODAY).quotesAt).toBeNull();
  });

  it("applying does not change the received state", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);
    const copy = structuredClone(state);

    run(state, recordQuotes(quote(1, 36, "2026-09-25T10:00:00")), { type: "record-fetch", kind: "quotes", at: "2026-09-25T10:00:00" });

    expect(state).toEqual(copy);
  });
});

describe("the current value by the last quote", () => {
  // 100 PETR4 at R$ 30, worth R$ 36 now; 0,5 BTC at R$ 300.000, never quoted.
  const state = run(
    withAssets(["PETR4", "domestic-stocks"], ["BTC", "crypto"]),
    buy(1, "2026-03-10", 100, 30),
    buy(2, "2026-03-10", 0.5, 300_000),
    recordQuotes(quote(1, 36, "2026-09-25T14:32:00")),
  );

  it("is quantity × last quote, and the unrealized gain is the current value − the cost", () => {
    expect(asset(state, "PETR4")).toMatchObject({ quote: 3_600, quoteAt: "2026-09-25T14:32:00", currentValue: 360_000 });
    expect(asset(state, "PETR4").cost).toBeCloseTo(300_000, 6);
    expect(asset(state, "PETR4").unrealizedGain).toBeCloseTo(60_000, 6);
    expect(asset(state, "PETR4").totalGain).toBeCloseTo(60_000, 6);
    expect(asset(state, "PETR4").tags).toEqual([]);
  });

  it("an asset that never had a quote is worth its cost, tagged as such", () => {
    expect(asset(state, "BTC")).toMatchObject({ quote: null, quoteAt: null, tags: ["no-quote"] });
    expect(asset(state, "BTC").currentValue).toBeCloseTo(15_000_000, 6);
    expect(asset(state, "BTC").unrealizedGain).toBeCloseTo(0, 6);
  });

  it("a quote below a cent values a large quantity exactly", () => {
    const shib = run(withAssets(["SHIB", "crypto"]), buy(1, "2026-03-10", 1_000_000, 0.0001), recordQuotes(quote(1, 0.00012345, "2026-09-25T10:00:00")));

    expect(asset(shib, "SHIB").currentValue).toBeCloseTo(12_345, 6); // one million × R$ 0,00012345
  });

  it("the classes and the portfolio sum the current values and the gains", () => {
    const view = projectPortfolio(state, TODAY);

    expect(view.currentValue).toBeCloseTo(15_360_000, 6);
    expect(view.cost).toBeCloseTo(15_300_000, 6);
    expect(view.totalGain).toBeCloseTo(60_000, 6);
    expect(view.classes.find((c) => c.key === "domestic-stocks")!.value).toBeCloseTo(360_000, 6);
  });

  it("a zero position has no unrealized gain, and its total gain keeps the sale's result", () => {
    const sold = run(state, sell(1, "2026-09-01", 100, 35));

    expect(asset(sold, "PETR4")).toMatchObject({ currentValue: 0, unrealizedGain: null, tags: ["zero-position"] });
    expect(asset(sold, "PETR4").totalGain).toBeCloseTo(50_000, 6);
  });
});

describe("the stale quote", () => {
  const bought = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-03-10", 10, 30));

  it("more than 5 business days old is tagged, and still gives the current value", () => {
    // From Thursday 17/09 to Friday 25/09: 18, 21, 22, 23, 24, 25 are six business days.
    const state = run(bought, recordQuotes(quote(1, 36, "2026-09-17T18:00:00")));

    expect(asset(state, "PETR4").tags).toEqual(["stale-quote"]);
    expect(asset(state, "PETR4").currentValue).toBe(36_000);
    expect(projectPortfolio(state, TODAY).staleQuote).toBe(true);
  });

  it("5 business days old is not, and the weekend doesn't count", () => {
    // From Friday 18/09 to Friday 25/09: 21, 22, 23, 24, 25.
    const state = run(bought, recordQuotes(quote(1, 36, "2026-09-18T09:00:00")));

    expect(asset(state, "PETR4").tags).toEqual([]);
    expect(projectPortfolio(state, TODAY).staleQuote).toBe(false);
    expect(projectPortfolio(state, "2026-09-27").staleQuote).toBe(false); // Sunday: still 5
    expect(projectPortfolio(state, "2026-09-28").staleQuote).toBe(true); // Monday: 6
  });

  it("an asset with no position doesn't raise the portfolio's warning", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), recordQuotes(quote(1, 36, "2026-09-01T09:00:00")));

    expect(asset(state, "PETR4").tags).toEqual(["stale-quote", "zero-position"]);
    expect(projectPortfolio(state, TODAY).staleQuote).toBe(false);
  });
});

// ---------------------------------------------------------------- helpers

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  return run(emptyPortfolio(), ...assets.map(([ticker, assetClass]): PortfolioCommand => ({ type: "save-asset", asset: { ticker, assetClass } })));
}

const quote = (asset: number, price: number, at: string): QuoteToRecord => ({ asset, price: decimal(price), at: at as IsoDateTime });

const recordQuotes = (...quotes: QuoteToRecord[]): PortfolioCommand => ({ type: "record-quotes", quotes });

const trade =
  (kind: "buy" | "sell") =>
  (asset: number, date: string, quantity: number, unitPrice: number): PortfolioCommand => ({
    type: "save-trade",
    trade: { asset, kind, date: date as IsoDate, quantity: decimal(quantity), unitPrice: decimal(unitPrice) },
  });
const buy = trade("buy");
const sell = trade("sell");

function execute(state: PortfolioState, command: PortfolioCommand) {
  return apply(state, command, TODAY);
}

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  return commands.reduce((s, command) => {
    const result = execute(s, command);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, state);
}

function asset(state: PortfolioState, ticker: string): AssetView {
  return projectPortfolio(state, TODAY)
    .classes.flatMap((c) => c.assets)
    .find((a) => a.ticker === ticker)!;
}
