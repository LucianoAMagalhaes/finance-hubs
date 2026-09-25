import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  exchangeRate,
  projectPortfolio,
  type AssetClass,
  type AssetView,
  type IsoDate,
  type IsoDateTime,
  type PortfolioCommand,
  type PortfolioState,
  type TradeToSave,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25"; // a Friday

describe("a trade in dollars", () => {
  it("records the exchange rate of the trade, exactly to 4 places", () => {
    const state = run(withAssets(["AAPL", "international-stocks"]), buy(1, "2026-03-10", 10, 200, 5.4213));

    expect(state.trades).toEqual([
      { id: 1, asset: 1, kind: "buy", date: "2026-03-10", quantity: decimal(10), unitPrice: decimal(200), exchangeRate: 54213 },
    ]);
  });

  it("is refused without an exchange rate, on a buy and on a sale", () => {
    const state = run(withAssets(["AAPL", "international-stocks"]), buy(1, "2026-03-10", 10, 200, 5));
    const refusal = { ok: false, error: "Informe o câmbio da operação em dólar." };

    expect(execute(state, buy(1, "2026-03-11", 10, 200, null))).toEqual(refusal);
    expect(execute(state, sell(1, "2026-03-11", 5, 210, null))).toEqual(refusal);
    expect(execute(state, saveTrade({ ...state.trades[0]!, exchangeRate: undefined }))).toEqual(refusal);
  });

  it("refuses an exchange rate that is not positive or has more than 4 places", () => {
    const state = withAssets(["AAPL", "international-stocks"]);

    expect(execute(state, saveTrade({ ...trade(1, 10, 200), exchangeRate: 0 }))).toEqual({
      ok: false,
      error: "O câmbio tem que ser maior que zero.",
    });
    expect(execute(state, saveTrade({ ...trade(1, 10, 200), exchangeRate: 5.42 }))).toEqual({
      ok: false,
      error: "O câmbio aceita até 4 casas decimais.",
    });
  });

  it("an asset in reais has no exchange rate", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);

    expect(execute(state, buy(1, "2026-03-10", 10, 30, 5))).toEqual({ ok: false, error: "Só a operação em dólar tem câmbio." });
    expect(run(state, buy(1, "2026-03-10", 10, 30, null)).trades[0]!.exchangeRate).toBeNull();
  });

  it("the rate is only ever changed by correcting the trade", () => {
    const state = run(withAssets(["AAPL", "international-stocks"]), buy(1, "2026-03-10", 10, 200, 5));

    const moved = run(state, saveTrade({ ...state.trades[0]!, date: "2026-03-12" }));
    const corrected = run(state, saveTrade({ ...state.trades[0]!, exchangeRate: exchangeRate(5.1) }));

    expect(moved.trades[0]!.exchangeRate).toBe(exchangeRate(5));
    expect(corrected.trades[0]!.exchangeRate).toBe(exchangeRate(5.1));
  });
});

describe("the position in dollars and in reais", () => {
  // 10 AAPL at US$ 200 with R$ 5,00, then 10 at US$ 220 with R$ 5,50, then a sale of 5 at US$ 250 with R$ 5,20.
  const bought = run(
    withAssets(["AAPL", "international-stocks"]),
    buy(1, "2026-03-10", 10, 200, 5),
    buy(1, "2026-04-10", 10, 220, 5.5),
  );
  const sold = run(bought, sell(1, "2026-05-10", 5, 250, 5.2));

  it("the average price and the cost run in parallel, each buy entering reais by price × its exchange rate", () => {
    const aapl = asset(bought, "AAPL");

    expect(aapl.currency).toBe("USD");
    expect(aapl.inDollars!.averagePrice).toBeCloseTo(21_000, 6); // (2.000 + 2.200) ÷ 20
    expect(aapl.inDollars!.cost).toBeCloseTo(420_000, 6);
    expect(aapl.averagePrice).toBeCloseTo(110_500, 6); // (10.000 + 12.100) ÷ 20
    expect(aapl.cost).toBeCloseTo(2_210_000, 6);
  });

  it("the sale's result in reais is (price × the sale's exchange rate − average price in reais) × quantity", () => {
    const aapl = asset(sold, "AAPL");

    expect(aapl.realizedGain).toBeCloseTo(97_500, 6); // (250 × 5,20 − 1.105) × 5
    expect(aapl.inDollars!.realizedGain).toBeCloseTo(20_000, 6); // (250 − 210) × 5, only to show
    expect(aapl.trades[0]!.realizedGain).toBeCloseTo(97_500, 6);
    expect(aapl.cost).toBeCloseTo(1_657_500, 6);
    expect(aapl.inDollars!.cost).toBeCloseTo(315_000, 6);
  });

  it("each trade shows its exchange rate and its total in dollars and in reais", () => {
    expect(asset(sold, "AAPL").trades.map((t) => [t.kind, t.exchangeRate, t.dollarTotal, t.total])).toEqual([
      ["sell", exchangeRate(5.2), 125_000, expect.closeTo(650_000, 6)],
      ["buy", exchangeRate(5.5), 220_000, expect.closeTo(1_210_000, 6)],
      ["buy", exchangeRate(5), 200_000, expect.closeTo(1_000_000, 6)],
    ]);
  });

  it("an asset in reais has no dollars at all", () => {
    const petr = asset(run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-03-10", 10, 30, null)), "PETR4");

    expect(petr).toMatchObject({ currency: "BRL", inDollars: null });
    expect(petr.trades[0]).toMatchObject({ exchangeRate: null, dollarTotal: null, total: 30_000 });
  });
});

describe("the current value in reais", () => {
  const sold = run(
    withAssets(["AAPL", "international-stocks"]),
    buy(1, "2026-03-10", 10, 200, 5),
    buy(1, "2026-04-10", 10, 220, 5.5),
    sell(1, "2026-05-10", 5, 250, 5.2),
  );

  it("is quantity × quote × current exchange rate, and the total gain in reais carries the exchange rate too", () => {
    const state = run(sold, recordQuotes([quote(1, 230)], rate(5.4, "2026-09-25T14:32:00")));
    const aapl = asset(state, "AAPL");

    expect(aapl.quote).toBe(23_000); // in dollars, the asset's currency
    expect(aapl.currentValue).toBeCloseTo(1_863_000, 6); // 15 × 230 × 5,40
    expect(aapl.unrealizedGain).toBeCloseTo(205_500, 6);
    expect(aapl.totalGain).toBeCloseTo(303_000, 6); // 2.055 + the sale's 975
    expect(aapl.totalGainPercent).toBeCloseTo((303_000 / 1_657_500) * 100, 6);
    expect(aapl.inDollars).toMatchObject({ currentValue: 345_000 });
    expect(aapl.inDollars!.unrealizedGain).toBeCloseTo(30_000, 6);
    expect(aapl.inDollars!.totalGain).toBeCloseTo(50_000, 6); // 300 + the sale's 200
    expect(aapl.tags).toEqual([]);
  });

  it("the classes and the portfolio stay in reais", () => {
    const state = run(
      sold,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      buy(2, "2026-03-10", 100, 30, null),
      recordQuotes([quote(1, 230), quote(2, 36)], rate(5.4, "2026-09-25T14:32:00")),
    );
    const view = projectPortfolio(state, TODAY);

    expect(view.classes.find((c) => c.key === "international-stocks")!.value).toBeCloseTo(1_863_000, 6);
    expect(view.currentValue).toBeCloseTo(1_863_000 + 360_000, 6);
    expect(view.cost).toBeCloseTo(1_657_500 + 300_000, 6);
    expect(view.totalGain).toBeCloseTo(303_000 + 60_000, 6);
  });

  it("a payout, in reais, enters the total gain in reais only", () => {
    const state = run(
      sold,
      recordQuotes([quote(1, 230)], rate(5.4, "2026-09-25T14:32:00")),
      { type: "save-payout", payout: { asset: 1, date: "2026-08-15", kind: "dividend", amount: 10_000 } },
    );

    expect(asset(state, "AAPL").totalGain).toBeCloseTo(313_000, 6);
    expect(asset(state, "AAPL").inDollars!.totalGain).toBeCloseTo(50_000, 6);
  });

  it("while there never was a current exchange rate, the asset is worth its cost in reais, tagged as such", () => {
    const state = run(sold, recordQuotes([quote(1, 230)]));
    const aapl = asset(state, "AAPL");

    expect(aapl.tags).toEqual(["no-exchange-rate"]);
    expect(aapl.currentValue).toBeCloseTo(1_657_500, 6);
    expect(aapl.unrealizedGain).toBeCloseTo(0, 6);
    expect(aapl.inDollars).toMatchObject({ currentValue: 345_000 });
    expect(projectPortfolio(state, TODAY).exchangeRate).toBeNull();
  });

  it("with no quote, the asset is worth its cost in both currencies", () => {
    const state = run(sold, recordQuotes([], rate(5.4, "2026-09-25T14:32:00")));
    const aapl = asset(state, "AAPL");

    expect(aapl.tags).toEqual(["no-quote"]);
    expect(aapl.currentValue).toBeCloseTo(1_657_500, 6);
    expect(aapl.inDollars!.currentValue).toBeCloseTo(315_000, 6);
  });
});

describe("the current exchange rate", () => {
  const bought = run(withAssets(["AAPL", "international-stocks"]), buy(1, "2026-03-10", 10, 200, 5));

  it("keeps only the last one, with its time, and the snapshot shows it", () => {
    const state = run(bought, recordQuotes([], rate(5.3, "2026-09-25T10:00:00")), recordQuotes([], rate(5.4213, "2026-09-25T14:32:00")));

    expect(state.exchangeRate).toEqual({ rate: 54213, at: "2026-09-25T14:32:00" });
    expect(projectPortfolio(state, TODAY)).toMatchObject({
      exchangeRate: { rate: 54213, at: "2026-09-25T14:32:00" },
      staleExchangeRate: false,
    });
  });

  it("recording quotes without a rate keeps the last rate", () => {
    const state = run(bought, recordQuotes([], rate(5.3, "2026-09-25T10:00:00")), recordQuotes([quote(1, 230)]));

    expect(state.exchangeRate).toEqual({ rate: exchangeRate(5.3), at: "2026-09-25T10:00:00" });
  });

  it("more than 5 business days old warns, and still gives the current value", () => {
    // From Thursday 17/09 to Friday 25/09: six business days.
    const stale = run(bought, recordQuotes([quote(1, 230)], rate(5.4, "2026-09-17T18:00:00")));
    const fresh = run(bought, recordQuotes([quote(1, 230)], rate(5.4, "2026-09-18T09:00:00")));

    expect(projectPortfolio(stale, TODAY).staleExchangeRate).toBe(true);
    expect(asset(stale, "AAPL").currentValue).toBeCloseTo(1_242_000, 6); // 10 × 230 × 5,40
    expect(projectPortfolio(fresh, TODAY).staleExchangeRate).toBe(false);
  });

  it("with no position in dollars, an old rate doesn't warn", () => {
    const state = run(withAssets(["AAPL", "international-stocks"]), recordQuotes([], rate(5.4, "2026-09-01T09:00:00")));

    expect(projectPortfolio(state, TODAY).staleExchangeRate).toBe(false);
  });

  it("what comes from outside is checked whole", () => {
    expect(execute(bought, recordQuotes([], { rate: 0, at: "2026-09-25T10:00:00" }))).toEqual({
      ok: false,
      error: "O câmbio atual tem que ser maior que zero.",
    });
    expect(execute(bought, recordQuotes([], { rate: 5.4, at: "2026-09-25T10:00:00" }))).toEqual({
      ok: false,
      error: "O câmbio atual aceita até 4 casas decimais.",
    });
    expect(execute(bought, recordQuotes([], { rate: 54000, at: "2026-09-25" as IsoDateTime }))).toEqual({
      ok: false,
      error: "O câmbio atual precisa da hora em que foi obtido.",
    });
  });
});

// ---------------------------------------------------------------- helpers

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  return run(emptyPortfolio(), ...assets.map(([ticker, assetClass]): PortfolioCommand => ({ type: "save-asset", asset: { ticker, assetClass } })));
}

const trade = (asset: number, quantity: number, unitPrice: number): TradeToSave => ({
  asset,
  kind: "buy",
  date: "2026-03-10",
  quantity: decimal(quantity),
  unitPrice: decimal(unitPrice),
});

const saveTrade = (t: TradeToSave): PortfolioCommand => ({ type: "save-trade", trade: t });

const typed =
  (kind: "buy" | "sell") =>
  (asset: number, date: string, quantity: number, unitPrice: number, rate: number | null): PortfolioCommand =>
    saveTrade({ ...trade(asset, quantity, unitPrice), kind, date: date as IsoDate, exchangeRate: rate === null ? null : exchangeRate(rate) });
const buy = typed("buy");
const sell = typed("sell");

const quote = (asset: number, price: number) => ({ asset, price: decimal(price), at: "2026-09-25T14:32:00" as IsoDateTime });

const rate = (value: number, at: string) => ({ rate: exchangeRate(value), at: at as IsoDateTime });

const recordQuotes = (
  quotes: ReturnType<typeof quote>[],
  exchangeRate?: { rate: number; at: IsoDateTime },
): PortfolioCommand => ({ type: "record-quotes", quotes, ...(exchangeRate && { exchangeRate }) });

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
