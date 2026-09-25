import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  projectPortfolio,
  type AssetClass,
  type AssetView,
  type IsoDate,
  type PayoutKind,
  type PayoutToSave,
  type PortfolioCommand,
  type PortfolioState,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("recording a payout by hand", () => {
  it("records the asset, the payment date, the kind and the net amount in cents", () => {
    const state = executeOk(withAssets(["ITSA4", "domestic-stocks"]), savePayout(payout("2026-08-20", "interest-on-equity", 5_412)));

    expect(state.payouts).toEqual([{ id: 1, asset: 1, date: "2026-08-20", kind: "interest-on-equity", amount: 5_412 }]);
    expect(asset(state, "ITSA4").payouts).toEqual([{ id: 1, date: "2026-08-20", kind: "interest-on-equity", amount: 5_412 }]);
  });

  it("any asset takes a payout, with or without position, and every kind is accepted", () => {
    let state = withAssets(["HGLG11", "real-estate-funds"], ["BTC", "crypto"]);
    const kinds: PayoutKind[] = ["dividend", "interest-on-equity", "fund-income", "interest"];
    for (const kind of kinds) state = executeOk(state, savePayout({ ...payout("2026-08-20", kind, 100), asset: 2 }));

    expect(asset(state, "BTC").payouts.map((p) => p.kind)).toEqual(["interest", "fund-income", "interest-on-equity", "dividend"]);
  });

  it("refuses an amount that is not positive, or not whole cents", () => {
    const state = withAssets(["ITSA4", "domestic-stocks"]);

    expect(execute(state, savePayout(payout("2026-08-20", "dividend", 0)))).toEqual({
      ok: false,
      error: "O valor do provento tem que ser maior que zero.",
    });
    expect(execute(state, savePayout(payout("2026-08-20", "dividend", -500))).ok).toBe(false);
    expect(execute(state, savePayout(payout("2026-08-20", "dividend", 10.5)))).toEqual({
      ok: false,
      error: "Informe o valor do provento em centavos.",
    });
  });

  it("refuses an unknown kind, an asset that doesn't exist, an invalid date and a date after today", () => {
    const state = withAssets(["ITSA4", "domestic-stocks"]);

    expect(execute(state, { type: "save-payout", payout: null as unknown as PayoutToSave })).toEqual({
      ok: false,
      error: "Escolha o tipo do provento.",
    });

    expect(execute(state, savePayout(payout("2026-08-20", "bonus" as PayoutKind, 100)))).toEqual({
      ok: false,
      error: "Escolha o tipo do provento.",
    });
    expect(execute(state, savePayout({ ...payout("2026-08-20", "dividend", 100), asset: 9 }))).toEqual({
      ok: false,
      error: "Esse ativo não existe.",
    });
    expect(execute(state, savePayout(payout("2026-02-30", "dividend", 100)))).toEqual({
      ok: false,
      error: "Informe uma data válida.",
    });
    expect(execute(state, savePayout(payout("2026-09-26", "dividend", 100)))).toEqual({
      ok: false,
      error: "O provento não pode ter data de pagamento depois de hoje.",
    });
  });

  it("doesn't change the quantity, the average price nor the cost", () => {
    const bought = run(withAssets(["ITSA4", "domestic-stocks"]), buy(1, "2026-01-10", 100, 10));
    const paid = executeOk(bought, savePayout(payout("2026-02-10", "dividend", 30_000)));

    const { quantity, averagePrice, cost, currentValue, realizedGain } = asset(bought, "ITSA4");
    expect(asset(paid, "ITSA4")).toMatchObject({ quantity, averagePrice, cost, currentValue, realizedGain });
  });
});

describe("payouts in the total gain", () => {
  it("the asset's total gain adds its payouts, also with a zero position", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      sell(1, "2026-03-10", 100, 35), // result 500,00
    );
    const paid = executeOk(
      executeOk(state, savePayout(payout("2026-02-10", "dividend", 4_100))),
      savePayout(payout("2026-04-10", "interest-on-equity", 900)),
    );

    const petr = asset(paid, "PETR4");
    expect(petr.tags).toContain("zero-position");
    expect(petr.payoutsReceived).toBe(5_000);
    expect(petr.totalGain).toBeCloseTo(55_000, 6);
  });

  it("the class and the portfolio add every asset's payouts, and the band says how much of the gain came from them", () => {
    let state = run(
      withAssets(["ITSA4", "domestic-stocks"], ["BBAS3", "domestic-stocks"], ["HGLG11", "real-estate-funds"]),
      buy(1, "2026-01-10", 100, 10),
      buy(3, "2026-01-10", 10, 160),
    );
    state = executeOk(state, savePayout({ asset: 1, date: "2026-02-10", kind: "dividend", amount: 1_000 }));
    state = executeOk(state, savePayout({ asset: 2, date: "2026-02-10", kind: "dividend", amount: 2_000 }));
    state = executeOk(state, savePayout({ asset: 3, date: "2026-02-15", kind: "fund-income", amount: 4_000 }));

    const view = projectPortfolio(state, TODAY);
    expect(view.classes.find((c) => c.key === "domestic-stocks")!.totalGain).toBe(3_000);
    expect(view.classes.find((c) => c.key === "real-estate-funds")!.totalGain).toBe(4_000);
    expect(view.totalGain).toBe(7_000);
    expect(view.payoutsReceived).toBe(7_000);
  });

  it("the expanded row lists the payouts newest first; on the same date, the last entered first", () => {
    let state = withAssets(["HGLG11", "real-estate-funds"]);
    for (const [date, amount] of [["2026-05-15", 100], ["2026-07-15", 200], ["2026-06-15", 300], ["2026-07-15", 400]] as const) {
      state = executeOk(state, savePayout(payout(date, "fund-income", amount)));
    }

    expect(asset(state, "HGLG11").payouts.map((p) => [p.date, p.amount])).toEqual([
      ["2026-07-15", 400],
      ["2026-07-15", 200],
      ["2026-06-15", 300],
      ["2026-05-15", 100],
    ]);
  });
});

describe("correcting and deleting a payout", () => {
  it("any field is corrected by the payout's id, keeping it", () => {
    const state = executeOk(
      withAssets(["ITSA4", "domestic-stocks"], ["BBAS3", "domestic-stocks"]),
      savePayout(payout("2026-08-20", "dividend", 5_000)),
    );

    const corrected = executeOk(state, savePayout({ id: 1, asset: 2, date: "2026-08-21", kind: "interest-on-equity", amount: 4_250 }));

    expect(corrected.payouts).toEqual([{ id: 1, asset: 2, date: "2026-08-21", kind: "interest-on-equity", amount: 4_250 }]);
    expect(asset(corrected, "ITSA4").payoutsReceived).toBe(0);
    expect(asset(corrected, "BBAS3").payoutsReceived).toBe(4_250);
  });

  it("the correction checks every field, and refuses a payout that doesn't exist", () => {
    const state = executeOk(withAssets(["ITSA4", "domestic-stocks"]), savePayout(payout("2026-08-20", "dividend", 5_000)));

    expect(execute(state, savePayout({ id: 1, ...payout("2026-08-20", "dividend", 0) })).ok).toBe(false);
    expect(execute(state, savePayout({ id: 7, ...payout("2026-08-20", "dividend", 100) }))).toEqual({
      ok: false,
      error: "Esse provento não existe.",
    });
  });

  it("delete-payout removes it for good, and the gain goes with it", () => {
    const state = executeOk(withAssets(["ITSA4", "domestic-stocks"]), savePayout(payout("2026-08-20", "dividend", 5_000)));

    const deleted = executeOk(state, { type: "delete-payout", id: 1 });

    expect(deleted.payouts).toEqual([]);
    expect(asset(deleted, "ITSA4")).toMatchObject({ payouts: [], payoutsReceived: 0, totalGain: 0 });
    expect(execute(deleted, { type: "delete-payout", id: 1 })).toEqual({ ok: false, error: "Esse provento não existe." });
  });

  it("delete-asset refuses an asset with a payout", () => {
    const state = executeOk(withAssets(["ITSA4", "domestic-stocks"]), savePayout(payout("2026-08-20", "dividend", 5_000)));

    expect(execute(state, { type: "delete-asset", id: 1 })).toEqual({
      ok: false,
      error: "ITSA4 tem proventos: um ativo com histórico fica na carteira para sempre.",
    });
  });
});

// ---------------------------------------------------------------- helpers

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  let state = emptyPortfolio();
  for (const [ticker, assetClass] of assets) state = executeOk(state, { type: "save-asset", asset: { ticker, assetClass } });
  return state;
}

/** A payout of the first asset. */
const payout = (date: string, kind: PayoutKind, amount: number): PayoutToSave => ({ asset: 1, date: date as IsoDate, kind, amount });

const savePayout = (p: PayoutToSave): PortfolioCommand => ({ type: "save-payout", payout: p });

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

function executeOk(state: PortfolioState, command: PortfolioCommand): PortfolioState {
  const result = execute(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  return commands.reduce(executeOk, state);
}

function asset(state: PortfolioState, ticker: string): AssetView {
  return projectPortfolio(state, TODAY)
    .classes.flatMap((c) => c.assets)
    .find((a) => a.ticker === ticker)!;
}
