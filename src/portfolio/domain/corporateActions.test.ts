import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  exchangeRate,
  projectPortfolio,
  type AssetClass,
  type AssetView,
  type CorporateActionKind,
  type CorporateActionToSave,
  type IsoDate,
  type PortfolioCommand,
  type PortfolioState,
  type TradeKind,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("a corporate action", () => {
  it("a split multiplies the quantity, keeps the cost, and the average price adjusts", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", 100, 30), action("PETR4", "split", "2026-03-10", 1, 4));

    expect(asset(state, "PETR4")).toMatchObject({ quantity: decimal(400), averagePrice: 750, cost: 300_000 });
  });

  it("a reverse split divides the quantity by the ratio, and the average price grows", () => {
    const state = run(withAssets(["MGLU3", "domestic-stocks"]), buy("MGLU3", "2026-01-10", 100, 2), action("MGLU3", "reverse-split", "2026-03-10", 10, 1));

    expect(asset(state, "MGLU3")).toMatchObject({ quantity: decimal(10), averagePrice: 2_000, cost: 20_000 });
  });

  it("a bonus of 1 new for each 10 adds a tenth, with no cost of its own", () => {
    const state = run(withAssets(["ITSA4", "domestic-stocks"]), buy("ITSA4", "2026-01-10", 100, 11), action("ITSA4", "bonus", "2026-03-10", 10, 11));

    const itsa = asset(state, "ITSA4");
    expect(itsa).toMatchObject({ quantity: decimal(110), cost: 110_000 });
    expect(itsa.averagePrice).toBeCloseTo(1_000, 6);
  });

  it("in dollars, the average price adjusts in dollars and in reais", () => {
    const state = run(
      withAssets(["AAPL", "international-stocks"]),
      buy("AAPL", "2026-01-10", 10, 200, 5),
      action("AAPL", "split", "2026-03-10", 1, 4),
    );

    const aapl = asset(state, "AAPL");
    expect(aapl).toMatchObject({ quantity: decimal(40), averagePrice: 25_000, cost: 1_000_000 });
    expect(aapl.inDollars).toMatchObject({ averagePrice: 5_000, cost: 200_000 });
  });

  it("the average price of the sales after it is the adjusted one", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy("PETR4", "2026-01-10", 100, 40),
      action("PETR4", "split", "2026-03-10", 1, 4),
      sell("PETR4", "2026-04-10", 200, 12), // (12 − 10) × 200
    );

    expect(asset(state, "PETR4")).toMatchObject({ quantity: decimal(200), averagePrice: 1_000 });
    expect(asset(state, "PETR4").realizedGain).toBeCloseTo(40_000, 6);
  });

  it("does nothing to an asset with no position on its date", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), action("PETR4", "split", "2026-01-10", 1, 4), buy("PETR4", "2026-03-10", 10, 30));

    expect(asset(state, "PETR4")).toMatchObject({ quantity: decimal(10), averagePrice: 3_000 });
  });

  it("the fraction left over stays in the quantity, until its sale is launched", () => {
    const state = run(
      withAssets(["MGLU3", "domestic-stocks"]),
      buy("MGLU3", "2026-01-10", 105, 2),
      action("MGLU3", "reverse-split", "2026-03-10", 10, 1),
    );

    expect(asset(state, "MGLU3").quantity).toBe(decimal(10.5));

    const sold = run(state, sell("MGLU3", "2026-03-20", 0.5, 19));
    expect(asset(sold, "MGLU3").quantity).toBe(decimal(10));
  });
});

describe("in date order with the trades", () => {
  it("on the same date, the action comes before the day's trades, even entered after them", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy("PETR4", "2026-01-10", 100, 30),
      buy("PETR4", "2026-03-10", 10, 8),
      action("PETR4", "split", "2026-03-10", 1, 4),
    );

    expect(asset(state, "PETR4").quantity).toBe(decimal(410));
  });

  it("a sale on the action's date is compared with the quantity already split", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", 100, 30), action("PETR4", "split", "2026-03-10", 1, 4));

    expect(attempt(state, sell("PETR4", "2026-03-10", 400, 8)).ok).toBe(true);
    expect(attempt(state, sell("PETR4", "2026-03-10", 401, 8))).toEqual({ ok: false, error: "Em 10/03/2026 havia só 400 PETR4 para vender." });
  });

  it("an action entered later with an earlier date redoes the position from its date", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy("PETR4", "2026-01-10", 100, 30),
      buy("PETR4", "2026-05-10", 100, 8),
      action("PETR4", "split", "2026-03-10", 1, 4),
    );

    expect(asset(state, "PETR4")).toMatchObject({ quantity: decimal(500), cost: 380_000 });
  });
});

describe("correcting and deleting an action", () => {
  const split = () =>
    run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy("PETR4", "2026-01-10", 100, 30),
      action("PETR4", "split", "2026-03-10", 1, 4),
      sell("PETR4", "2026-04-10", 300, 8),
    );

  it("the date and the ratio can be corrected, keeping the action's id", () => {
    const state = split();
    const [saved] = state.corporateActions;

    const corrected = run(state, { ...saved!, date: "2026-03-11", ratio: { from: 1, to: 5 } });

    expect(corrected.corporateActions).toEqual([
      { id: saved!.id, asset: saved!.asset, kind: "split", date: "2026-03-11", ratio: { from: 1, to: 5 } },
    ]);
    expect(asset(corrected, "PETR4").quantity).toBe(decimal(200));
  });

  it("a correction that would leave a later sale uncovered is refused, in Portuguese", () => {
    const state = split();
    const [saved] = state.corporateActions;
    const refusal = { ok: false, error: "Isso deixaria sem cobertura a venda de PETR4 de 10/04/2026." };

    expect(attempt(state, { ...saved!, ratio: { from: 1, to: 2 } })).toEqual(refusal);
    expect(attempt(state, { ...saved!, date: "2026-04-11" })).toEqual(refusal);
  });

  it("a new action that would leave a later sale uncovered is refused", () => {
    const state = split();

    expect(attempt(state, action("PETR4", "reverse-split", "2026-03-20", 10, 1))).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de PETR4 de 10/04/2026.",
    });
  });

  it("deleting removes the action for good, unless a later sale would be left uncovered", () => {
    const state = split();
    const id = state.corporateActions[0]!.id;

    expect(execute(state, { type: "delete-corporate-action", id })).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de PETR4 de 10/04/2026.",
    });

    const withoutSale = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", 100, 30), action("PETR4", "split", "2026-03-10", 1, 4));
    const deleted = executeOk(withoutSale, { type: "delete-corporate-action", id: withoutSale.corporateActions[0]!.id });
    expect(deleted.corporateActions).toEqual([]);
    expect(asset(deleted, "PETR4").quantity).toBe(decimal(100));
  });

  it("a trade's correction also counts the actions: undoing the buy the split multiplied is refused", () => {
    const state = split();

    expect(execute(state, { type: "save-trade", trade: { ...state.trades[0]!, quantity: decimal(70) } })).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de PETR4 de 10/04/2026.",
    });
    expect(execute(state, { type: "save-trade", trade: { ...state.trades[0]!, quantity: decimal(75) } }).ok).toBe(true);
  });

  it("the correction or deletion of an action that does not exist is refused", () => {
    const state = split();

    expect(attempt(state, { ...state.corporateActions[0]!, id: 9 })).toEqual({ ok: false, error: "Esse evento não existe." });
    expect(execute(state, { type: "delete-corporate-action", id: 9 })).toEqual({ ok: false, error: "Esse evento não existe." });
  });

  it("the asset of an action does not change", () => {
    const state = split();
    const other = executeOk(state, { type: "save-asset", asset: { ticker: "VALE3", assetClass: "domestic-stocks" } });

    expect(attempt(other, { ...state.corporateActions[0]!, asset: assetId(other, "VALE3") })).toEqual({
      ok: false,
      error: "O ativo de um evento não muda.",
    });
  });
});

describe("what an action accepts", () => {
  const state = withAssets(["PETR4", "domestic-stocks"], ["AAPL", "international-stocks"], ["HGLG11", "real-estate-funds"], ["BTC", "crypto"]);

  it("exists in Ações Nacionais, Ações Internacionais and FIIs, and is refused in Cripto", () => {
    for (const ticker of ["PETR4", "AAPL", "HGLG11"]) expect(attempt(state, action(ticker, "split", "2026-03-10", 1, 2)).ok).toBe(true);

    expect(attempt(state, action("BTC", "split", "2026-03-10", 1, 2))).toEqual({
      ok: false,
      error: "Evento corporativo só existe em Ações Nacionais, Ações Internacionais e FIIs.",
    });
  });

  it("refuses a ratio that isn't two integers greater than zero, or that changes nothing", () => {
    const refusal = { ok: false, error: "A proporção tem que ter dois números inteiros maiores que zero." };

    expect(attempt(state, action("PETR4", "split", "2026-03-10", 0, 4))).toEqual(refusal);
    expect(attempt(state, action("PETR4", "split", "2026-03-10", 1, 2.5))).toEqual(refusal);
    expect(attempt(state, action("PETR4", "split", "2026-03-10", 1, -2))).toEqual(refusal);
    expect(attempt(state, action("PETR4", "split", "2026-03-10", 3, 3))).toEqual({
      ok: false,
      error: "Uma proporção de 3 para 3 não muda a quantidade.",
    });
  });

  it("refuses a date after today, an invalid date, a kind it doesn't know and an asset that doesn't exist", () => {
    expect(attempt(state, action("PETR4", "split", "2026-09-26", 1, 2))).toEqual({
      ok: false,
      error: "O evento não pode ter data depois de hoje.",
    });
    expect(attempt(state, action("PETR4", "split", "2026-02-30", 1, 2))).toEqual({ ok: false, error: "Informe uma data válida." });
    expect(attempt(state, action("PETR4", "merger" as CorporateActionKind, "2026-03-10", 1, 2))).toEqual({
      ok: false,
      error: "Escolha desdobramento, grupamento ou bonificação.",
    });
    expect(attempt(state, { asset: 99, kind: "split", date: "2026-03-10", ratio: { from: 1, to: 2 } })).toEqual({
      ok: false,
      error: "Esse ativo não existe.",
    });
  });

  it("applying does not change the received state", () => {
    const saved = run(state, action("PETR4", "split", "2026-03-10", 1, 2));
    const copy = structuredClone(saved);

    run(saved, { ...saved.corporateActions[0]!, ratio: { from: 1, to: 3 } });
    executeOk(saved, { type: "delete-corporate-action", id: saved.corporateActions[0]!.id });

    expect(saved).toEqual(copy);
  });
});

describe("the asset's history", () => {
  it("lists the actions with no price, newest first", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy("PETR4", "2026-01-10", 100, 30),
      action("PETR4", "split", "2026-03-10", 1, 4),
      action("PETR4", "bonus", "2026-05-10", 10, 11),
    );

    expect(asset(state, "PETR4").corporateActions).toEqual([
      { id: 2, date: "2026-05-10", kind: "bonus", ratio: { from: 10, to: 11 } },
      { id: 1, date: "2026-03-10", kind: "split", ratio: { from: 1, to: 4 } },
    ]);
  });

  it("an asset whose only history is an action is deleted with it", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), action("PETR4", "split", "2026-03-10", 1, 4));

    const deleted = executeOk(state, { type: "delete-asset", id: assetId(state, "PETR4") });

    expect(deleted.assets).toEqual([]);
    expect(deleted.corporateActions).toEqual([]);
  });

  it("the source's payout is worth the quantity after the actions up to the record date", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy("PETR4", "2026-01-10", 100, 30), action("PETR4", "split", "2026-03-10", 1, 4));

    const paid = executeOk(state, {
      type: "record-source-payouts",
      payouts: [
        { asset: assetId(state, "PETR4"), kind: "dividend", recordDate: "2026-03-09", paymentDate: "2026-04-01", perUnit: decimal(1) },
        { asset: assetId(state, "PETR4"), kind: "dividend", recordDate: "2026-03-10", paymentDate: "2026-04-02", perUnit: decimal(1) },
      ],
    });

    expect(paid.payouts.map((p) => p.amount)).toEqual([10_000, 40_000]);
  });
});

// ---------------------------------------------------------------- helpers

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  let state = emptyPortfolio();
  for (const [ticker, assetClass] of assets) state = executeOk(state, { type: "save-asset", asset: { ticker, assetClass } });
  return state;
}

/** A trade or an action of the asset with that ticker. Resolved against the state on apply. */
type Typed =
  | { ticker: string; kind: TradeKind; date: IsoDate; quantity: number; unitPrice: number; rate?: number }
  | { ticker: string; action: CorporateActionKind; date: IsoDate; from: number; to: number };

const typed =
  (kind: TradeKind) =>
  (ticker: string, date: string, quantity: number, unitPrice: number, rate?: number): Typed => ({
    ticker,
    kind,
    date: date as IsoDate,
    quantity,
    unitPrice,
    rate,
  });
const buy = typed("buy");
const sell = typed("sell");
const action = (ticker: string, kind: CorporateActionKind, date: string, from: number, to: number): Typed => ({
  ticker,
  action: kind,
  date: date as IsoDate,
  from,
  to,
});

function command(state: PortfolioState, t: Typed | CorporateActionToSave): PortfolioCommand {
  if (!("ticker" in t)) return { type: "save-corporate-action", action: t };
  const asset = assetId(state, t.ticker);
  if ("action" in t) return { type: "save-corporate-action", action: { asset, kind: t.action, date: t.date, ratio: { from: t.from, to: t.to } } };
  return {
    type: "save-trade",
    trade: {
      asset,
      kind: t.kind,
      date: t.date,
      quantity: decimal(t.quantity),
      unitPrice: decimal(t.unitPrice),
      ...(t.rate !== undefined && { exchangeRate: exchangeRate(t.rate) }),
    },
  };
}

function execute(state: PortfolioState, c: PortfolioCommand) {
  return apply(state, c, TODAY);
}

function executeOk(state: PortfolioState, c: PortfolioCommand): PortfolioState {
  const result = execute(state, c);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function attempt(state: PortfolioState, t: Typed | CorporateActionToSave) {
  return execute(state, command(state, t));
}

function run(state: PortfolioState, ...entries: (Typed | CorporateActionToSave)[]): PortfolioState {
  for (const t of entries) state = executeOk(state, command(state, t));
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
