import { describe, expect, it, vi } from "vitest";
import { apply, decimal, emptyPortfolio, type IsoDate, type PortfolioCommand, type PortfolioState, type RateIndex } from "@/portfolio/domain";
import { liveSources, refresh } from "@/portfolio/sources";

const NOW = "2026-09-25T14:32:00";
const official: RateIndex[] = [{ kind: "ipca", date: "2026-08-01", rate: decimal(-0.32) }];
const projected: RateIndex[] = [{ kind: "ipca-projection", date: "2026-09-01", rate: decimal(0.56) }];
const register = (ticker = "CDB IPCA", indexer: "ipca-plus" | "cdi-percentage" = "ipca-plus"): PortfolioCommand => ({ type: "save-asset", asset: {
  ticker, assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer, rate: decimal(6), maturityDate: "2028-01-02" },
} });
const buy = (asset: number, date: IsoDate): PortfolioCommand => ({ type: "save-trade", trade: { asset, kind: "buy", date, amount: 100_000 } });
function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  for (const command of commands) {
    const next = apply(state, command, "2026-09-25");
    if (!next.ok) throw new Error(next.error);
    state = next.value;
  }
  return state;
}
function sources() {
  return { ...liveSources(), monthlyIpca: vi.fn(async (): Promise<RateIndex[]> => official),
    ipcaProjections: vi.fn(async (): Promise<RateIndex[]> => projected), dailyCdi: vi.fn(async (): Promise<RateIndex[]> => []),
  };
}

describe("refreshing monthly IPCA", () => {
  it("fetches from the first application's month and projects only months still lacking official IPCA", async () => {
    const state = run(emptyPortfolio(), register(), buy(1, "2026-08-17"));
    const port = sources();
    expect(await refresh(state, port, NOW, false)).toEqual([
      { type: "record-rate-indexes", rateIndexes: [...official, ...projected] },
      { type: "record-fetch", kind: "rate-indexes", at: NOW },
    ]);
    expect(port.monthlyIpca).toHaveBeenCalledWith("2026-08-01", "2026-09-01");
    expect(port.ipcaProjections).toHaveBeenCalledWith(["2026-09-01"]);
    expect(port.dailyCdi).not.toHaveBeenCalled();
  });
  it("includes the previous month before the fifteenth and chooses the earliest of multiple applications", async () => {
    const state = run(emptyPortfolio(), register(), buy(1, "2026-09-20"), register("LCI IPCA"), buy(2, "2025-12-01"));
    const port = sources();
    await refresh(state, port, NOW, true);
    expect(port.monthlyIpca).toHaveBeenCalledWith("2025-11-01", "2026-09-01");
  });
  it("never fetches without an IPCA application, even when forced", async () => {
    for (const state of [emptyPortfolio(), run(emptyPortfolio(), register()), run(emptyPortfolio(), register("CDB CDI", "cdi-percentage"), buy(1, "2026-09-20"))]) {
      const port = sources();
      await refresh(state, port, NOW, true);
      expect(port.monthlyIpca).not.toHaveBeenCalled();
      expect(port.ipcaProjections).not.toHaveBeenCalled();
    }
  });
  it("keeps stored official months and asks only missing windows, updating projections every day", async () => {
    const state = run(emptyPortfolio(), register(), buy(1, "2026-06-15"), { type: "record-rate-indexes", rateIndexes: [
      { kind: "ipca", date: "2026-07-01", rate: 0 }, ...official, ...projected,
    ] });
    const port = sources();
    port.monthlyIpca.mockResolvedValue([]);
    await refresh(state, port, NOW, true);
    expect(port.monthlyIpca.mock.calls).toEqual([["2026-06-01", "2026-06-01"], ["2026-09-01", "2026-09-01"]]);
    expect(port.ipcaProjections).toHaveBeenCalledWith(["2026-06-01", "2026-09-01"]);
  });
  it("waits more than a day after success unless forced, including for an application made today", async () => {
    const invested = run(emptyPortfolio(), register(), buy(1, "2026-09-25"));
    const fresh = run(invested, { type: "record-fetch", kind: "rate-indexes", at: "2026-09-24T14:32:00" });
    const port = sources();
    port.monthlyIpca.mockResolvedValue([]);
    expect(await refresh(fresh, port, NOW, false)).toEqual([]);
    expect(port.monthlyIpca).not.toHaveBeenCalled();
    expect(await refresh(fresh, port, NOW, true)).toHaveLength(2);
    expect(port.monthlyIpca).toHaveBeenCalledWith("2026-09-01", "2026-09-01");
    const old = run(invested, { type: "record-fetch", kind: "rate-indexes", at: "2026-09-24T14:31:59" });
    expect(await refresh(old, port, NOW, false)).toHaveLength(2);
  });
  it("preserves successful official data when Focus fails, stays silent and retries the failed fetch", async () => {
    const state = run(emptyPortfolio(), register(), buy(1, "2026-08-17"));
    const port = sources();
    port.ipcaProjections.mockRejectedValue(new Error("Focus unavailable"));
    const warn = vi.spyOn(console, "warn");
    try {
      const commands = await refresh(state, port, NOW, true);
      expect(commands).toEqual([{ type: "record-rate-indexes", rateIndexes: official }]);
      const next = run(state, ...commands);
      expect(next.lastFetch["rate-indexes"]).toBeUndefined();
      await refresh(next, port, NOW, false);
      expect(port.monthlyIpca).toHaveBeenLastCalledWith("2026-09-01", "2026-09-01");
      expect(warn).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });
  it("preserves successful projections when SGS fails without recording a successful daily fetch", async () => {
    const state = run(emptyPortfolio(), register(), buy(1, "2026-08-17"));
    const port = sources();
    port.monthlyIpca.mockRejectedValue(new Error("SGS unavailable"));
    expect(await refresh(state, port, NOW, true)).toEqual([{ type: "record-rate-indexes", rateIndexes: projected }]);
    expect(port.ipcaProjections).toHaveBeenCalledWith(["2026-08-01", "2026-09-01"]);
    port.ipcaProjections.mockRejectedValue(new Error("Focus unavailable"));
    expect(await refresh(state, port, NOW, true)).toEqual([]);
  });
  it("shares the daily gate with CDI and preserves CDI when both IPCA sources fail", async () => {
    const state = run(emptyPortfolio(), register(), buy(1, "2026-08-17"), register("CDB CDI", "cdi-percentage"), buy(2, "2026-09-20"));
    const port = sources();
    const cdi: RateIndex[] = [{ kind: "cdi", date: "2026-09-24", rate: decimal(0.05) }];
    port.dailyCdi.mockResolvedValue(cdi);
    port.monthlyIpca.mockRejectedValue(new Error("SGS unavailable"));
    port.ipcaProjections.mockRejectedValue(new Error("Focus unavailable"));
    expect(await refresh(state, port, NOW, true)).toEqual([{ type: "record-rate-indexes", rateIndexes: cdi }]);
  });
});
