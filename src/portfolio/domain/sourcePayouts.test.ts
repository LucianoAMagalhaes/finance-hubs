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
  type PortfolioCommand,
  type PortfolioState,
  type SourcePayout,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("payouts from the source", () => {
  it("enter on the payment date, by the quantity at the end of the record date, counting that day's trades", () => {
    const state = run(
      withAssets(["HGLG11", "real-estate-funds"]),
      buy(1, "2026-08-01", 100, 150),
      buy(1, "2026-08-31", 50, 150),
      sell(1, "2026-09-01", 30, 155),
      recordSourcePayouts(sourcePayout("fund-income", "2026-08-31", "2026-09-15", 1.17)),
    );

    expect(asset(state, "HGLG11").payouts).toEqual([{ id: 1, date: "2026-09-15", kind: "fund-income", amount: 17_550 }]);
  });

  it("a record date with no position brings nothing", () => {
    const state = run(
      withAssets(["HGLG11", "real-estate-funds"]),
      buy(1, "2026-08-01", 100, 150),
      sell(1, "2026-08-31", 100, 155),
      buy(1, "2026-09-01", 100, 150),
      recordSourcePayouts(sourcePayout("fund-income", "2026-08-31", "2026-09-15", 1.17)),
    );

    expect(asset(state, "HGLG11").payouts).toEqual([]);
  });

  it("interest on equity enters 15% smaller, and dividends and fund income enter whole, rounded to the cent", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-08-01", 100, 36),
      recordSourcePayouts(
        sourcePayout("interest-on-equity", "2026-08-21", "2026-09-21", 0.67407131),
        sourcePayout("dividend", "2026-08-21", "2026-09-22", 0.47156696),
      ),
    );

    // 100 × 0,67407131 = 67,407131, less 15% = 57,296…; 100 × 0,47156696 = 47,156696.
    expect(asset(state, "PETR4").payouts.map((p) => [p.kind, p.amount])).toEqual([
      ["dividend", 4_716],
      ["interest-on-equity", 5_730],
    ]);
  });

  it("a payout announced and not yet paid is not recorded, and enters once its payment date comes", () => {
    const announced = sourcePayout("dividend", "2026-08-21", "2026-12-21", 0.47156696);
    const before = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-08-01", 100, 36), recordSourcePayouts(announced));

    expect(asset(before, "PETR4").payouts).toEqual([]);

    const paid = executeOk(before, recordSourcePayouts(announced), "2026-12-21");
    expect(asset(paid, "PETR4").payouts).toEqual([{ id: 1, date: "2026-12-21", kind: "dividend", amount: 4_716 }]);
  });

  it("an origin already seen never comes back: the corrected payout is not overwritten, nor the deleted one recreated", () => {
    const august = sourcePayout("fund-income", "2026-07-31", "2026-08-14", 1.17);
    const september = sourcePayout("fund-income", "2026-08-31", "2026-09-15", 1.17);
    let state = run(withAssets(["HGLG11", "real-estate-funds"]), buy(1, "2026-07-01", 100, 150), recordSourcePayouts(august, september));

    state = run(
      state,
      { type: "save-payout", payout: { id: 1, asset: 1, date: "2026-08-14", kind: "fund-income", amount: 11_000 } },
      { type: "delete-payout", id: 2 },
      recordSourcePayouts(august, september),
    );

    expect(asset(state, "HGLG11").payouts).toEqual([{ id: 1, date: "2026-08-14", kind: "fund-income", amount: 11_000 }]);
  });

  it("the same origin twice in one answer is recorded once", () => {
    const september = sourcePayout("fund-income", "2026-08-31", "2026-09-15", 1.17);
    const state = run(withAssets(["HGLG11", "real-estate-funds"]), buy(1, "2026-07-01", 100, 150), recordSourcePayouts(september, september));

    expect(asset(state, "HGLG11").payouts).toHaveLength(1);
  });

  it("a retroactive buy makes the next fetch create the payouts that were missing, without touching the ones recorded", () => {
    const july = sourcePayout("fund-income", "2026-06-30", "2026-07-14", 1.1);
    const august = sourcePayout("fund-income", "2026-07-31", "2026-08-14", 1.17);
    let state = run(withAssets(["HGLG11", "real-estate-funds"]), buy(1, "2026-07-10", 100, 150), recordSourcePayouts(july, august));
    expect(asset(state, "HGLG11").payouts.map((p) => [p.date, p.amount])).toEqual([["2026-08-14", 11_700]]);

    state = run(state, buy(1, "2026-06-01", 20, 140), recordSourcePayouts(july, august));

    expect(asset(state, "HGLG11").payouts.map((p) => [p.date, p.amount])).toEqual([
      ["2026-08-14", 11_700],
      ["2026-07-14", 2_200],
    ]);
  });

  it("a payout of an asset deleted while the source was asked is dropped", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), recordSourcePayouts({ ...sourcePayout("dividend", "2026-08-21", "2026-09-21", 1), asset: 9 }));

    expect(state.payouts).toEqual([]);
  });

  it("a deleted asset takes its seen origins with it, and the next asset with its id starts clean", () => {
    const september = sourcePayout("fund-income", "2026-08-31", "2026-09-15", 1.17);
    let state = run(
      withAssets(["HGLG11", "real-estate-funds"]),
      buy(1, "2026-07-01", 100, 150),
      recordSourcePayouts(september),
      { type: "delete-payout", id: 1 },
      { type: "delete-trade", id: 1 },
      { type: "delete-asset", id: 1 },
      { type: "save-asset", asset: { ticker: "KNRI11", assetClass: "real-estate-funds" } },
      buy(1, "2026-07-01", 10, 150),
      recordSourcePayouts(september),
    );

    expect(asset(state, "KNRI11").payouts.map((p) => p.amount)).toEqual([1_170]);
    state = executeOk(state, recordSourcePayouts(september));
    expect(asset(state, "KNRI11").payouts).toHaveLength(1);
  });

  it("refuses a payout with an unknown kind, an invalid date or a value per unit that is not a positive decimal", () => {
    const state = withAssets(["PETR4", "domestic-stocks"]);
    const ok = sourcePayout("dividend", "2026-08-21", "2026-09-21", 1);

    expect(execute(state, recordSourcePayouts({ ...ok, kind: "bonus" as PayoutKind })).ok).toBe(false);
    expect(execute(state, recordSourcePayouts({ ...ok, recordDate: "2026-02-30" as IsoDate })).ok).toBe(false);
    expect(execute(state, recordSourcePayouts({ ...ok, paymentDate: "21/09/2026" as IsoDate })).ok).toBe(false);
    expect(execute(state, recordSourcePayouts({ ...ok, perUnit: 0 })).ok).toBe(false);
    expect(execute(state, recordSourcePayouts({ ...ok, perUnit: 1.5 })).ok).toBe(false);
    expect(execute(state, { type: "record-source-payouts", payouts: null as unknown as SourcePayout[] }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- helpers

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  return run(emptyPortfolio(), ...assets.map(([ticker, assetClass]): PortfolioCommand => ({ type: "save-asset", asset: { ticker, assetClass } })));
}

/** A payout the source brings for the first asset. */
const sourcePayout = (kind: PayoutKind, recordDate: string, paymentDate: string, perUnit: number): SourcePayout => ({
  asset: 1,
  kind,
  recordDate: recordDate as IsoDate,
  paymentDate: paymentDate as IsoDate,
  perUnit: decimal(perUnit),
});

const recordSourcePayouts = (...payouts: SourcePayout[]): PortfolioCommand => ({ type: "record-source-payouts", payouts });

const trade =
  (kind: "buy" | "sell") =>
  (asset: number, date: string, quantity: number, unitPrice: number): PortfolioCommand => ({
    type: "save-trade",
    trade: { asset, kind, date: date as IsoDate, quantity: decimal(quantity), unitPrice: decimal(unitPrice) },
  });
const buy = trade("buy");
const sell = trade("sell");

function execute(state: PortfolioState, command: PortfolioCommand, today: IsoDate = TODAY) {
  return apply(state, command, today);
}

function executeOk(state: PortfolioState, command: PortfolioCommand, today: IsoDate = TODAY): PortfolioState {
  const result = execute(state, command, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  return commands.reduce((s, c) => executeOk(s, c), state);
}

function asset(state: PortfolioState, ticker: string): AssetView {
  return projectPortfolio(state, TODAY)
    .classes.flatMap((c) => c.assets)
    .find((a) => a.ticker === ticker)!;
}
