import { describe, expect, it } from "vitest";
import { apply, decimal, emptyPortfolio, projectPortfolio, type IsoDate, type PortfolioCommand, type PortfolioState, type RateIndex } from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";
const bond: PortfolioCommand = { type: "save-asset", asset: { ticker: "CDB IPCA", assetClass: "fixed-income", bond: {
  kind: "private-bond", bondType: "cdb", indexer: "ipca-plus", rate: decimal(6), maturityDate: "2028-01-02",
} } };
const buy = (date: IsoDate, amount = 100_000): PortfolioCommand => ({ type: "save-trade", trade: { asset: 1, kind: "buy", date, amount } });
const index = (date: IsoDate, rate: number, kind: RateIndex["kind"] = "ipca"): PortfolioCommand => ({ type: "record-rate-indexes", rateIndexes: [{ kind, date, rate: decimal(rate) }] });
const view = (state: PortfolioState, date: IsoDate = TODAY) => projectPortfolio(state, date).classes.find((c) => c.key === "fixed-income")!.assets[0]!;

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  for (const command of commands) {
    const next = apply(state, command, TODAY);
    if (!next.ok) throw new Error(next.error);
    state = next.value;
  }
  return state;
}

describe("IPCA plus bonds", () => {
  it("accrues a whole inflation month between its fifteenths, multiplied by the yearly spread", () => {
    const state = run(emptyPortfolio(), bond, buy("2026-08-17"), index("2026-08-01", 1), index("2026-09-01", 0));
    // Aug 15 is Saturday: Aug 17 through Sep 15 is the whole 20-business-day interval.
    expect(view(state, "2026-09-15").quote).toBeCloseTo(101.468158, 6);
    expect(view(state, "2026-08-17").quote).toBe(100);
  });
  it("uses business-day pro rata on both sides of the fifteenth with first-application normalization", () => {
    const state = run(emptyPortfolio(), bond, buy("2026-08-24"), index("2026-08-01", 1), index("2026-09-01", 2));
    // Aug 24 -> Sep 21: 15/20 of August inflation, 4/21 of September, 19/252 of the spread.
    expect(view(state, "2026-09-21").quote).toBeCloseTo(101.575072, 6);
    expect(view(state, "2026-08-24").quote).toBe(100);
  });
  it("requires the first application month's index and uses the prior month before the fifteenth", () => {
    const state = run(emptyPortfolio(), bond, buy("2026-09-01"), index("2026-08-01", 1));
    expect(view(state)).toMatchObject({ quote: null, currentValue: 100_000, tags: ["no-rate-index", "no-score"] });
    const ready = run(state, index("2026-09-01", 0));
    // Sep 1 -> Sep 15: 9/20 of August inflation and nine days of the spread.
    expect(view(ready, "2026-09-15").quote).toBeCloseTo(100.658024, 6);
  });
  it("reprices projections with the latest median and then with official IPCA", () => {
    const state = run(emptyPortfolio(), bond, buy("2026-08-17"), index("2026-08-01", 1, "ipca-projection"));
    const revised = run(state, index("2026-08-01", 0.5, "ipca-projection"));
    const official = run(revised, index("2026-08-01", -0.32));
    expect(view(revised, "2026-09-15").quote!).toBeLessThan(view(state, "2026-09-15").quote!);
    expect(view(official, "2026-09-15").quote).toBeCloseTo(100.142039, 6);
    expect(run(official, index("2026-08-01", 5, "ipca-projection"))).toEqual(official);
  });
  it("clamps an existing redemption after revision, keeps its realized gain, and allows a later application", () => {
    const state = run(emptyPortfolio(), bond, buy("2026-08-17"), index("2026-08-01", 1, "ipca-projection"),
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-09-15", amount: 101_460 } });
    const revised = run(state, index("2026-08-01", 0.99));
    expect(view(revised)).toMatchObject({ quantity: 0, cost: 0, totalGain: 1460 });
    expect(view(revised).trades[0]).toMatchObject({ quantity: decimal(1000), redeemsAll: true, total: 101_460, realizedGain: 1460 });
    expect(view(run(revised, buy("2026-09-21"))).currentValue).toBeGreaterThan(100_000);
    expect(apply(revised, { type: "save-trade", trade: { id: 2, asset: 1, kind: "sell", date: "2026-09-15", amount: 101_460 } }, TODAY).ok).toBe(false);
    expect(apply(revised, { type: "delete-trade", id: 1 }, TODAY).ok).toBe(false);
    expect(apply(revised, { type: "save-trade", trade: { id: 1, asset: 1, kind: "buy", date: "2026-08-17", amount: 50_000 } }, TODAY).ok).toBe(false);
  });
  it("refuses new redemptions over the curve and freezes the index and spread at maturity", () => {
    const state = run(emptyPortfolio(), bond, buy("2026-08-17"), index("2026-08-01", 1), index("2026-09-01", 2));
    expect(apply(state, { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-09-15", amount: 101_469 } }, TODAY).ok).toBe(false);
    if (bond.type !== "save-asset") throw new Error("Expected registration.");
    const matured = run(state, { ...bond, asset: { ...bond.asset, id: 1, bond: { ...bond.asset.bond!, maturityDate: "2026-09-15" } } });
    expect(view(matured).quote).toBe(view(matured, "2026-09-15").quote);
    expect(view(matured).tags).toContain("matured");
  });
  it("reports the latest official IPCA month only in fixed income", () => {
    const state = run(emptyPortfolio(), index("2026-08-01", 0.1), index("2026-09-01", 0.2, "ipca-projection"));
    const classes = projectPortfolio(state, TODAY).classes;
    expect(classes.find((c) => c.key === "fixed-income")).toMatchObject({ ipcaThrough: "2026-08-01" });
    for (const c of classes.filter((c) => c.key !== "fixed-income")) expect(c.ipcaThrough).toBeNull();
  });
});
