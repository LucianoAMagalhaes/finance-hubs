import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  parseDecimal,
  projectPortfolio,
  type AssetClass,
  type AssetView,
  type IsoDate,
  type PortfolioState,
  type TradeToSave,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("buying an asset", () => {
  it("records the date, the fractional quantity and the unit price, exactly", () => {
    const state = buyOk(withAssets(["BTC", "crypto"]), buy("BTC", "2026-03-10", "0.00321", "612000"));

    expect(state.trades).toEqual([
      { id: 1, asset: assetId(state, "BTC"), kind: "buy", date: "2026-03-10", quantity: 321000, unitPrice: 612000_00000000 },
    ]);
  });

  it("a unit price below a cent is kept whole", () => {
    const state = buyOk(withAssets(["SHIB", "crypto"]), buy("SHIB", "2026-03-10", "1000000", "0.00012345"));

    expect(state.trades[0]!.unitPrice).toBe(12345);
    expect(asset(state, "SHIB").cost).toBeCloseTo(12_345, 6); // one million × R$ 0,00012345 = R$ 123,45
  });

  it("refuses a quantity or a unit price that is not positive, in Portuguese", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);

    expect(tryBuy(state, { ...trade(state, buy("PETR4", "2026-03-10", "1", "10")), quantity: 0 })).toEqual({
      ok: false,
      error: "A quantidade tem que ser maior que zero.",
    });
    expect(tryBuy(state, { ...trade(state, buy("PETR4", "2026-03-10", "1", "10")), quantity: -100 })).toEqual({
      ok: false,
      error: "A quantidade tem que ser maior que zero.",
    });
    expect(tryBuy(state, { ...trade(state, buy("PETR4", "2026-03-10", "1", "10")), unitPrice: 0 })).toEqual({
      ok: false,
      error: "O preço unitário tem que ser maior que zero.",
    });
  });

  it("what comes from the browser is checked whole: a quantity past the eighth place, a bad date, a missing asset", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);
    const good = trade(state, buy("PETR4", "2026-03-10", "1", "10"));

    expect(tryBuy(state, { ...good, quantity: 0.5 })).toEqual({
      ok: false,
      error: "A quantidade aceita até 8 casas decimais.",
    });
    expect(tryBuy(state, { ...good, unitPrice: Number.NaN })).toEqual({
      ok: false,
      error: "O preço unitário aceita até 8 casas decimais.",
    });
    expect(tryBuy(state, { ...good, date: "2026-02-30" as IsoDate })).toEqual({ ok: false, error: "Informe uma data válida." });
    expect(tryBuy(state, { ...good, asset: 99 })).toEqual({ ok: false, error: "Esse ativo não existe." });
  });

  it("refuses a date after today", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);

    expect(tryBuy(state, buy("PETR4", "2026-09-26", "1", "10"))).toEqual({
      ok: false,
      error: "A operação não pode ter data depois de hoje.",
    });
    expect(tryBuy(state, buy("PETR4", TODAY, "1", "10")).ok).toBe(true);
  });

  it("applying does not change the received state", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);
    const copy = structuredClone(state);

    buyOk(state, buy("PETR4", "2026-03-10", "100", "36.80"));

    expect(state).toEqual(copy);
  });
});

describe("the position after buys", () => {
  it("one buy: the quantity, the average price is the unit price, and the cost", () => {
    const state = buyOk(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-03-10", "100", "36.80"));

    expect(asset(state, "PETR4")).toMatchObject({ quantity: decimal(100), averagePrice: 3680, cost: 368_000 });
  });

  it("each buy recalculates the average price: (cost + quantity × price) ÷ new quantity", () => {
    const state = buyOk(
      withAssets(["ITSA4", "domestic-stocks"]),
      buy("ITSA4", "2026-01-10", "100", "10"),
      buy("ITSA4", "2026-02-10", "50", "13"),
      buy("ITSA4", "2026-03-10", "50", "7"),
    );

    // (1.000 + 650) ÷ 150 = 11; (1.650 + 350) ÷ 200 = 10
    expect(asset(state, "ITSA4")).toMatchObject({ quantity: decimal(200), averagePrice: 1000, cost: 200_000 });
  });

  it("fractional quantities keep the method", () => {
    const state = buyOk(
      withAssets(["BTC", "crypto"]),
      buy("BTC", "2026-01-10", "0,5", "300000"),
      buy("BTC", "2026-02-10", "0,25", "360000"),
    );

    const btc = asset(state, "BTC");
    expect(btc.quantity).toBe(75_000_000);
    expect(btc.averagePrice).toBeCloseTo(32_000_000, 6);
    expect(btc.cost).toBeCloseTo(24_000_000, 6);
  });

  it("buys entered out of date order give the same position as in order", () => {
    const inOrder = buyOk(
      withAssets(["KNRI11", "real-estate-funds"]),
      buy("KNRI11", "2026-01-10", "10", "140"),
      buy("KNRI11", "2026-02-10", "5", "146.20"),
      buy("KNRI11", "2026-03-10", "3", "151"),
    );
    const outOfOrder = buyOk(
      withAssets(["KNRI11", "real-estate-funds"]),
      buy("KNRI11", "2026-03-10", "3", "151"),
      buy("KNRI11", "2026-01-10", "10", "140"),
      buy("KNRI11", "2026-02-10", "5", "146.20"),
    );

    const { trades: _, ...position } = asset(inOrder, "KNRI11");
    expect(asset(outOfOrder, "KNRI11")).toMatchObject(position);
    expect(position).toMatchObject({ quantity: decimal(18) });
    expect(position.cost).toBe(258_400); // 1.400 + 731 + 453
  });

  it("the expanded row lists the trades newest first, and same-day ones last entered first", () => {
    const state = buyOk(
      withAssets(["PETR4", "domestic-stocks"]),
      buy("PETR4", "2026-02-10", "10", "30"),
      buy("PETR4", "2026-03-10", "5", "32"),
      buy("PETR4", "2026-01-10", "20", "28"),
      buy("PETR4", "2026-03-10", "1", "33"),
    );

    expect(asset(state, "PETR4").trades.map((t) => [t.date, t.kind, t.quantity, t.unitPrice, t.total])).toEqual([
      ["2026-03-10", "buy", decimal(1), decimal(33), 3_300],
      ["2026-03-10", "buy", decimal(5), decimal(32), 16_000],
      ["2026-02-10", "buy", decimal(10), decimal(30), 30_000],
      ["2026-01-10", "buy", decimal(20), decimal(28), 56_000],
    ]);
  });

  it("only the asset's own trades count", () => {
    const state = buyOk(
      withAssets(["PETR4", "domestic-stocks"], ["VALE3", "domestic-stocks"]),
      buy("PETR4", "2026-02-10", "10", "30"),
      buy("VALE3", "2026-02-10", "7", "60"),
    );

    expect(asset(state, "PETR4")).toMatchObject({ quantity: decimal(10), cost: 30_000 });
    expect(asset(state, "VALE3")).toMatchObject({ quantity: decimal(7), cost: 42_000 });
  });
});

describe("without a quote", () => {
  it("the current value is the cost, the gain is zero, and the asset is tagged \"no-quote\"", () => {
    const state = buyOk(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-03-10", "100", "36.80"));

    expect(asset(state, "PETR4")).toMatchObject({
      quote: null,
      currentValue: 368_000,
      totalGain: 0,
      tags: ["no-quote"],
    });
  });

  it("an asset with no trade is also without a quote, worth nothing, and a zero position", () => {
    expect(asset(withAssets(["PETR4", "domestic-stocks"]), "PETR4")).toMatchObject({
      quantity: 0,
      currentValue: 0,
      tags: ["no-quote", "zero-position"],
    });
  });
});

describe("the classes and the portfolio", () => {
  const state = buyOk(
    withAssets(["PETR4", "domestic-stocks"], ["VALE3", "domestic-stocks"], ["HGLG11", "real-estate-funds"], ["BTC", "crypto"]),
    buy("PETR4", "2026-02-10", "100", "30"), // R$ 3.000
    buy("VALE3", "2026-02-10", "50", "60"), // R$ 3.000
    buy("HGLG11", "2026-02-10", "20", "150"), // R$ 3.000
    buy("BTC", "2026-02-10", "0,002", "500000"), // R$ 1.000
  );
  const view = projectPortfolio(state, TODAY);
  const cls = (key: AssetClass) => view.classes.find((c) => c.key === key)!;

  it("the portfolio is worth the sum of its classes, and its cost is the sum of the costs", () => {
    expect(view.currentValue).toBeCloseTo(1_000_000, 6);
    expect(view.cost).toBeCloseTo(1_000_000, 6);
    expect(view.totalGain).toBe(0);
  });

  it("each class is worth its assets, with its share of the portfolio and how far it is from its target", () => {
    expect(cls("domestic-stocks")).toMatchObject({ value: 600_000, share: 60, target: 25, assetCount: 2 });
    expect(cls("domestic-stocks").toTarget).toBeCloseTo(-350_000, 6); // 25% of R$ 10.000 − R$ 6.000
    expect(cls("real-estate-funds")).toMatchObject({ value: 300_000, share: 30, assetCount: 1 });
    expect(cls("real-estate-funds").toTarget).toBeCloseTo(-200_000, 6);
    expect(cls("crypto").value).toBeCloseTo(100_000, 6);
    expect(cls("crypto").share).toBeCloseTo(10, 10);
    expect(cls("crypto").toTarget).toBeCloseTo(-50_000, 6);
    expect(cls("fixed-income")).toMatchObject({ value: 0, share: 0, assetCount: 0 });
    expect(cls("fixed-income").toTarget).toBeCloseTo(450_000, 6);
  });

  it("the class lists its assets by ticker", () => {
    expect(cls("domestic-stocks").assets.map((a) => a.ticker)).toEqual(["PETR4", "VALE3"]);
  });
});

// ---------------------------------------------------------------- helpers

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  let state = emptyPortfolio();
  for (const [ticker, assetClass] of assets) {
    const result = apply(state, { type: "save-asset", asset: { ticker, assetClass } }, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}

/** A buy of the asset with that ticker, the quantity and price as typed. Resolved against the state on apply. */
type Buy = { ticker: string; date: IsoDate; quantity: string; unitPrice: string };

const buy = (ticker: string, date: string, quantity: string, unitPrice: string): Buy => ({
  ticker,
  date: date as IsoDate,
  quantity,
  unitPrice,
});

function trade(state: PortfolioState, b: Buy): TradeToSave {
  return {
    asset: assetId(state, b.ticker),
    kind: "buy",
    date: b.date,
    quantity: parseDecimal(b.quantity)!,
    unitPrice: parseDecimal(b.unitPrice)!,
  };
}

function tryBuy(state: PortfolioState, b: Buy | TradeToSave) {
  return apply(state, { type: "save-trade", trade: "ticker" in b ? trade(state, b) : b }, TODAY);
}

function buyOk(state: PortfolioState, ...buys: Buy[]): PortfolioState {
  for (const b of buys) {
    const result = tryBuy(state, b);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}

function assetId(state: PortfolioState, ticker: string): number {
  return state.assets.find((a) => a.ticker === ticker)!.id;
}

function asset(state: PortfolioState, ticker: string): AssetView {
  return projectPortfolio(state, TODAY)
    .classes.flatMap((c) => c.assets)
    .find((a) => a.ticker === ticker)!;
}
