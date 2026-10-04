import { describe, expect, it } from "vitest";
import { apply, decimal, emptyPortfolio, projectPortfolio, type IsoDate, type PortfolioCommand, type PortfolioState, type RateIndex } from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";
const CDI_BOND: PortfolioCommand = { type: "save-asset", asset: {
  ticker: "CDB 110% CDI", assetClass: "fixed-income",
  bond: { kind: "private-bond", bondType: "cdb", indexer: "cdi-percentage", rate: decimal(110), maturityDate: "2028-01-02" },
} };
const application = (date: IsoDate, amount = 1_000_000): PortfolioCommand => ({ type: "save-trade", trade: { asset: 1, kind: "buy", date, amount } });
const indexes = (...rates: [IsoDate, number][]): PortfolioCommand => ({ type: "record-rate-indexes", rateIndexes: rates.map(([date, rate]): RateIndex => ({ kind: "cdi", date, rate: decimal(rate) })) });

describe("bonds yielding a percentage of CDI", () => {
  it("shows the date of the latest stored CDI in the fixed-income class only", () => {
    const state = run(emptyPortfolio(), CDI_BOND, application("2026-09-04"), indexes(["2026-09-23", 0.05], ["2026-09-24", 0.06]));
    const classes = projectPortfolio(state, TODAY).classes;
    expect(classes.find((c) => c.key === "fixed-income")).toMatchObject({ cdiThrough: "2026-09-24" });
    for (const c of classes.filter((c) => c.key !== "fixed-income")) expect(c).toMatchObject({ cdiThrough: null });
    expect(projectPortfolio(emptyPortfolio(), TODAY).classes.find((c) => c.key === "fixed-income")).toMatchObject({ cdiThrough: null });
  });
  it("stops the CDI product at maturity even when later rates arrive", () => {
    if (CDI_BOND.type !== "save-asset") throw new Error("Expected a bond registration.");
    const state = run(emptyPortfolio(), { ...CDI_BOND, asset: { ...CDI_BOND.asset, bond: { ...CDI_BOND.asset.bond!, maturityDate: "2026-09-09" } } },
      application("2026-09-04"), indexes(["2026-09-04", 0.05], ["2026-09-08", 0.06], ["2026-09-09", 1]),
    );
    expect(asset(state).quote).toBeCloseTo(100.121036, 8);
    expect(asset(state).tags).toEqual(["matured", "no-score"]);
  });
  it("converts later applications and redemptions with the CDI curve, keeping the gain after a total redemption", () => {
    const state = run(emptyPortfolio(), CDI_BOND, indexes(["2026-09-04", 0.05]),
      application("2026-09-04"), application("2026-09-08", 100_055),
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-09-09", amount: 100_110 } },
    );
    const view = asset(state, "2026-09-09");
    expect(view.trades[1]).toMatchObject({ quantity: decimal(1000), unitPrice: decimal(1.00055), total: 100_055 });
    expect(view.trades[0]).toMatchObject({ unitPrice: decimal(1.0011003), total: 100_110 });
    expect(view.totalGain).toBeCloseTo(1155.33, 5);
    const redeemed = run(state, { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-09-09", amount: 1_001_100, redeemsAll: true } });
    expect(asset(redeemed)).toMatchObject({ quantity: 0, cost: 0, currentValue: 0 });
    expect(asset(redeemed).totalGain).toBeCloseTo(1155, 6);
  });
  it("stays at cost without CDI from the first application onward, then loses the no-index tag", () => {
    const state = run(emptyPortfolio(), CDI_BOND, application("2026-09-04"), indexes(["2026-09-03", 0.05]));
    expect(asset(state)).toMatchObject({ currentValue: 1_000_000, quote: null, tags: ["no-rate-index", "no-score"] });
    const withIndex = run(state, indexes(["2026-09-04", 0.05]));
    expect(asset(withIndex, "2026-09-08")).toMatchObject({ quote: 100.055, tags: ["no-score"] });
  });
  it("carries the last daily CDI when the next business day has no recorded rate", () => {
    const state = run(emptyPortfolio(), CDI_BOND, application("2026-09-04"), indexes(["2026-09-04", 0.05]));
    // Friday and Tuesday at 110% of 0,05%: 1,00055 squared.
    expect(asset(state, "2026-09-09").quote).toBeCloseTo(100.11003, 8);
    expect(asset(state, "2026-09-07").quote).toBeCloseTo(100.055, 8);
    expect(asset(state, "2026-09-08").quote).toBeCloseTo(100.055, 8);
  });
  it("multiplies the daily rates through yesterday, skipping weekends and ANBIMA holidays", () => {
    const state = run(emptyPortfolio(), CDI_BOND, application("2026-09-04"), indexes(
      ["2026-09-04", 0.05], ["2026-09-07", 1], ["2026-09-08", 0.06], ["2026-09-09", 1],
    ));
    const view = asset(state, "2026-09-09");
    // Friday and Tuesday: R$ 10.000 × 1,00055 × 1,00066; Monday is Independência.
    expect(view.quote).toBeCloseTo(100.121036, 8);
    expect(view.currentValue).toBeCloseTo(1_001_210.36, 6);
    expect(view.tags).not.toContain("no-rate-index");
  });
});

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  for (const command of commands) {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}

function asset(state: PortfolioState, today: IsoDate = TODAY) {
  return projectPortfolio(state, today).classes.find((c) => c.key === "fixed-income")!.assets[0]!;
}
