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
  type PortfolioCommand,
  type PortfolioState,
  type TradeKind,
  type TradeToSave,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("selling", () => {
  it("reduces the quantity and keeps the average price", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", "100", "10"), sell("PETR4", "2026-02-10", "40", "15"));

    expect(asset(state, "PETR4")).toMatchObject({ quantity: decimal(60), averagePrice: 1000, cost: 60_000 });
  });

  it("fixes the result with the average price of that day: (sale price − average price) × quantity", () => {
    const state = run(
      withAssets(["ITSA4", "domestic-stocks"]),
      buy("ITSA4", "2026-01-10", "100", "10"),
      sell("ITSA4", "2026-02-10", "50", "12"), // (12 − 10) × 50 = 100
      buy("ITSA4", "2026-03-10", "50", "16"), // average (500 + 800) ÷ 100 = 13
      sell("ITSA4", "2026-04-10", "20", "11"), // (11 − 13) × 20 = −40
    );

    const itsa = asset(state, "ITSA4");
    expect(itsa.realizedGain).toBeCloseTo(6_000, 6);
    expect(itsa.trades.map((t) => [t.date, t.kind, t.realizedGain])).toEqual([
      ["2026-04-10", "sell", expect.closeTo(-4_000, 6)],
      ["2026-03-10", "buy", null],
      ["2026-02-10", "sell", expect.closeTo(10_000, 6)],
      ["2026-01-10", "buy", null],
    ]);
  });

  it("a sale entered later with an earlier date is fixed with the average price of its own day", () => {
    const state = run(
      withAssets(["VALE3", "domestic-stocks"]),
      buy("VALE3", "2026-01-10", "10", "50"),
      buy("VALE3", "2026-03-10", "10", "70"),
      sell("VALE3", "2026-02-10", "5", "60"), // on 10/02 the average was 50
    );

    expect(asset(state, "VALE3").realizedGain).toBeCloseTo(5_000, 6);
    expect(asset(state, "VALE3")).toMatchObject({ quantity: decimal(15) });
    expect(asset(state, "VALE3").averagePrice).toBeCloseTo(6_333.333333, 5); // (250 + 700) ÷ 15
  });

  it("selling everything makes the average price stop existing, and the next buy starts it over", () => {
    const sold = run(withAssets(["BTC", "crypto"]), buy("BTC", "2026-01-10", "0,5", "300000"), sell("BTC", "2026-02-10", "0,5", "360000"));

    expect(asset(sold, "BTC")).toMatchObject({ quantity: 0, averagePrice: null, cost: 0, currentValue: 0 });

    const again = run(sold, buy("BTC", "2026-03-10", "0,25", "400000"));

    expect(asset(again, "BTC").quantity).toBe(decimal(0.25));
    expect(asset(again, "BTC").averagePrice).toBeCloseTo(40_000_000, 6);
    expect(asset(again, "BTC").cost).toBeCloseTo(10_000_000, 6);
  });
});

describe("the quantity is never negative on any date", () => {
  it("refuses a sale larger than what there was on its date, in Portuguese", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-03-10", "50", "30"));

    expect(attempt(state, sell("PETR4", "2026-03-20", "80", "35"))).toEqual({
      ok: false,
      error: "Em 20/03/2026 havia só 50 PETR4 para vender.",
    });
    expect(attempt(state, sell("PETR4", "2026-02-01", "10", "35"))).toEqual({
      ok: false,
      error: "Em 01/02/2026 não havia PETR4 para vender.",
    });
  });

  it("a sale that takes what a later sale needs is refused", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", "100", "30"), sell("PETR4", "2026-05-10", "80", "35"));

    expect(attempt(state, sell("PETR4", "2026-03-10", "30", "32"))).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de PETR4 de 10/05/2026.",
    });
  });

  it("on the same date the trades follow the order they were entered in", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);

    expect(attempt(state, sell("PETR4", "2026-03-10", "10", "35")).ok).toBe(false);
    expect(run(state, buy("PETR4", "2026-03-10", "10", "30"), sell("PETR4", "2026-03-10", "10", "35")).trades).toHaveLength(2);
  });

  it("correcting a buy that would leave a later sale uncovered is refused", () => {
    const state = run(withAssets(["HGLG11", "real-estate-funds"]), buy("HGLG11", "2026-01-10", "20", "150"), sell("HGLG11", "2026-04-10", "15", "160"));
    const [b] = state.trades;

    expect(attempt(state, { ...b!, quantity: decimal(10) })).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de HGLG11 de 10/04/2026.",
    });
    expect(attempt(state, { ...b!, date: "2026-05-10" })).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de HGLG11 de 10/04/2026.",
    });
  });

  it("deleting a buy that would leave a later sale uncovered is refused", () => {
    const state = run(
      withAssets(["HGLG11", "real-estate-funds"]),
      buy("HGLG11", "2026-01-10", "20", "150"),
      buy("HGLG11", "2026-02-10", "5", "155"),
      sell("HGLG11", "2026-04-10", "18", "160"),
    );
    const [first, second] = state.trades;

    expect(execute(state, { type: "delete-trade", id: first!.id })).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de HGLG11 de 10/04/2026.",
    });
    expect(execute(state, { type: "delete-trade", id: second!.id }).ok).toBe(true);
  });

  it("moving a buy to another asset is checked on the asset it leaves", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"], ["PETR3", "domestic-stocks"]),
      buy("PETR4", "2026-01-10", "10", "30"),
      sell("PETR4", "2026-02-10", "10", "35"),
    );
    const [b] = state.trades;

    expect(attempt(state, { ...b!, asset: assetId(state, "PETR3") })).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de PETR4 de 10/02/2026.",
    });
  });
});

describe("correcting and deleting a trade", () => {
  it("a correction changes any field and keeps the trade's place in the order of entry", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"], ["VALE3", "domestic-stocks"]), buy("PETR4", "2026-01-10", "10", "30"), buy("PETR4", "2026-01-10", "5", "31"));
    const [first] = state.trades;

    const corrected = run(state, { ...first!, asset: assetId(state, "VALE3"), date: "2026-01-12", quantity: decimal(7), unitPrice: decimal(60) });

    expect(corrected.trades).toEqual([
      { id: first!.id, asset: assetId(state, "VALE3"), kind: "buy", date: "2026-01-12", quantity: decimal(7), unitPrice: decimal(60) },
      state.trades[1],
    ]);
    expect(asset(corrected, "PETR4")).toMatchObject({ quantity: decimal(5) });
    expect(asset(corrected, "VALE3")).toMatchObject({ quantity: decimal(7), cost: 42_000 });
  });

  it("a buy can be corrected into a sale, and the result follows", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", "10", "30"), buy("PETR4", "2026-02-10", "4", "40"));
    const second = state.trades[1]!;

    const corrected = run(state, { ...second, kind: "sell" });

    expect(asset(corrected, "PETR4")).toMatchObject({ quantity: decimal(6), averagePrice: 3000 });
    expect(asset(corrected, "PETR4").realizedGain).toBeCloseTo(4_000, 6);
  });

  it("the correction of a trade that does not exist is refused", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);

    expect(attempt(state, { ...trade(state, buy("PETR4", "2026-01-10", "1", "10")), id: 9 })).toEqual({
      ok: false,
      error: "Essa operação não existe.",
    });
    expect(execute(state, { type: "delete-trade", id: 9 })).toEqual({ ok: false, error: "Essa operação não existe." });
  });

  it("deleting removes the trade for good, and the position is redone without it", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", "10", "30"), sell("PETR4", "2026-02-10", "4", "40"));

    const deleted = executeOk(state, { type: "delete-trade", id: state.trades[1]!.id });

    expect(deleted.trades).toEqual([state.trades[0]]);
    expect(asset(deleted, "PETR4")).toMatchObject({ quantity: decimal(10), realizedGain: 0 });
  });

  it("refuses a kind that is neither a buy nor a sale", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);

    expect(attempt(state, { ...trade(state, buy("PETR4", "2026-01-10", "1", "10")), kind: "gift" as TradeKind })).toEqual({
      ok: false,
      error: "Escolha compra ou venda.",
    });
  });

  it("applying does not change the received state", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", "10", "30"));
    const copy = structuredClone(state);

    run(state, sell("PETR4", "2026-02-10", "4", "40"), { ...state.trades[0]!, quantity: decimal(12) });
    executeOk(state, { type: "delete-trade", id: state.trades[0]!.id });

    expect(state).toEqual(copy);
  });
});

describe("deleting an asset", () => {
  it("an asset without any trade is deleted for good", () => {
    const state = withAssets(["PETR4", "domestic-stocks"], ["VALE3", "domestic-stocks"]);

    const deleted = executeOk(state, { type: "delete-asset", id: assetId(state, "PETR4") });

    expect(deleted.assets.map((a) => a.ticker)).toEqual(["VALE3"]);
  });

  it("an asset with a trade is refused, even with its position sold out", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", "10", "30"), sell("PETR4", "2026-02-10", "10", "40"));

    expect(execute(state, { type: "delete-asset", id: assetId(state, "PETR4") })).toEqual({
      ok: false,
      error: "PETR4 tem operações: um ativo com histórico fica na carteira para sempre.",
    });
  });

  it("an asset that does not exist is refused", () => {
    expect(execute(emptyPortfolio(), { type: "delete-asset", id: 3 })).toEqual({ ok: false, error: "Esse ativo não existe." });
  });
});

describe("the total gain", () => {
  const state = run(
    withAssets(["PETR4", "domestic-stocks"], ["VALE3", "domestic-stocks"], ["BTC", "crypto"]),
    buy("PETR4", "2026-01-10", "100", "30"),
    sell("PETR4", "2026-02-10", "100", "38"), // + R$ 800, sold out
    buy("VALE3", "2026-01-10", "10", "60"),
    sell("VALE3", "2026-02-10", "4", "50"), // − R$ 40
    buy("BTC", "2026-01-10", "0,01", "300000"),
    sell("BTC", "2026-02-10", "0,005", "340000"), // + R$ 200
  );
  const view = projectPortfolio(state, TODAY);
  const cls = (key: AssetClass) => view.classes.find((c) => c.key === key)!;

  it("of an asset adds the sales' results to the unrealized gain, and outlives the position", () => {
    expect(asset(state, "PETR4").totalGain).toBeCloseTo(80_000, 6);
    expect(asset(state, "VALE3").totalGain).toBeCloseTo(-4_000, 6);
  });

  it("of a class adds up all its assets, with or without position, and the portfolio's adds up the classes", () => {
    expect(cls("domestic-stocks").totalGain).toBeCloseTo(76_000, 6);
    expect(cls("crypto").totalGain).toBeCloseTo(20_000, 6);
    expect(view.totalGain).toBeCloseTo(96_000, 6);
  });

  it("a sold-out asset adds nothing to the value and the cost", () => {
    expect(cls("domestic-stocks").value).toBeCloseTo(36_000, 6); // 6 VALE3 × R$ 60
    expect(view.cost).toBeCloseTo(186_000, 6); // + 0,005 BTC × R$ 300.000 = R$ 1.500
  });
});

describe("the zero position", () => {
  it("is tagged, and goes to the end of its class", () => {
    const state = run(
      withAssets(["ABEV3", "domestic-stocks"], ["PETR4", "domestic-stocks"], ["VALE3", "domestic-stocks"], ["BBAS3", "domestic-stocks"]),
      buy("ABEV3", "2026-01-10", "10", "12"),
      sell("ABEV3", "2026-02-10", "10", "13"),
      buy("VALE3", "2026-01-10", "10", "60"),
      buy("PETR4", "2026-01-10", "10", "30"),
    );

    const assets = projectPortfolio(state, TODAY).classes.find((c) => c.key === "domestic-stocks")!.assets;

    expect(assets.map((a) => [a.ticker, a.tags.includes("zero-position")])).toEqual([
      ["PETR4", false],
      ["VALE3", false],
      ["ABEV3", true],
      ["BBAS3", true],
    ]);
  });
});

// ---------------------------------------------------------------- helpers

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  let state = emptyPortfolio();
  for (const [ticker, assetClass] of assets) state = executeOk(state, { type: "save-asset", asset: { ticker, assetClass } });
  return state;
}

/** A trade of the asset with that ticker, the quantity and price as typed. Resolved against the state on apply. */
type Typed = { ticker: string; kind: TradeKind; date: IsoDate; quantity: string; unitPrice: string };

const typed =
  (kind: TradeKind) =>
  (ticker: string, date: string, quantity: string, unitPrice: string): Typed => ({ ticker, kind, date: date as IsoDate, quantity, unitPrice });
const buy = typed("buy");
const sell = typed("sell");

function trade(state: PortfolioState, t: Typed): TradeToSave {
  return {
    asset: assetId(state, t.ticker),
    kind: t.kind,
    date: t.date,
    quantity: parseDecimal(t.quantity)!,
    unitPrice: parseDecimal(t.unitPrice)!,
  };
}

function execute(state: PortfolioState, command: PortfolioCommand) {
  return apply(state, command, TODAY);
}

function executeOk(state: PortfolioState, command: PortfolioCommand): PortfolioState {
  const result = execute(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function attempt(state: PortfolioState, t: Typed | TradeToSave) {
  return execute(state, { type: "save-trade", trade: "ticker" in t ? trade(state, t) : t });
}

function run(state: PortfolioState, ...trades: (Typed | TradeToSave)[]): PortfolioState {
  for (const t of trades) {
    const result = attempt(state, t);
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
