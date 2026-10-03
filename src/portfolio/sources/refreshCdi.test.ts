import { describe, expect, it, vi } from "vitest";
import { apply, decimal, emptyPortfolio, type IsoDate, type PortfolioCommand, type PortfolioState, type RateIndex } from "@/portfolio/domain";
import { liveSources, refresh } from "@/portfolio/sources";

const NOW = "2026-09-25T14:32:00";
const cdi: RateIndex[] = [{ kind: "cdi", date: "2026-09-24", rate: decimal(0.055131) }];

describe("refreshing daily CDI", () => {
  it("a failed CDI fetch stays silent, preserves the previous fetch time and allows the next opening to retry", async () => {
    const state = run(emptyPortfolio(), register("CDB CDI"), application(1, "2026-09-04"),
      { type: "record-fetch", kind: "rate-indexes", at: "2026-09-23T14:32:00" },
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
    );
    const sources = { ...cdiSources(), latestQuote: vi.fn(async () => decimal(30)) };
    sources.dailyCdi.mockRejectedValue(new Error("BCB unavailable"));
    const warn = vi.spyOn(console, "warn");
    try {
      const commands = await refresh(state, sources, NOW, false);
      expect(commands).toEqual([
        { type: "record-quotes", quotes: [{ asset: 2, price: decimal(30), at: NOW }] },
        { type: "record-fetch", kind: "quotes", at: NOW },
      ]);
      const next = run(state, ...commands);
      expect(next.lastFetch["rate-indexes"]).toBe("2026-09-23T14:32:00");
      await refresh(next, sources, NOW, false);
      expect(sources.dailyCdi).toHaveBeenCalledTimes(2);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  it("does not ask without a CDI application, even when forced", async () => {
    const noApplication = run(emptyPortfolio(), register("CDB CDI"));
    const otherIndexers = run(emptyPortfolio(), register("CDB fixo", "fixed-rate"), register("CDB IPCA", "ipca-plus"),
      application(1, "2026-09-04"), application(2, "2026-09-04"));
    const startsToday = run(emptyPortfolio(), register("CDB CDI"), application(1, "2026-09-25"));
    for (const state of [emptyPortfolio(), noApplication, otherIndexers, startsToday]) {
      const sources = cdiSources();
      expect(await refresh(state, sources, NOW, true)).toEqual([]);
      expect(sources.dailyCdi).not.toHaveBeenCalled();
    }
  });
  it("restarts at a retroactive application before the first stored CDI", async () => {
    const state = run(emptyPortfolio(), register("CDB CDI"), application(1, "2026-09-04"),
      { type: "record-rate-indexes", rateIndexes: [{ kind: "cdi", date: "2026-09-04", rate: decimal(0.05) }, ...cdi] },
      application(1, "2026-01-02"),
    );
    const sources = cdiSources();
    await refresh(state, sources, NOW, true);
    expect(sources.dailyCdi).toHaveBeenCalledWith("2026-01-02", "2026-09-24");
  });
  it("asks only after the latest stored CDI, even when forced, and skips a complete history", async () => {
    const state = run(emptyPortfolio(), register("CDB CDI"), application(1, "2026-09-04"),
      { type: "record-rate-indexes", rateIndexes: [
        { kind: "cdi", date: "2026-09-04", rate: decimal(0.05) },
        { kind: "cdi", date: "2026-09-23", rate: decimal(0.05) },
      ] },
    );
    for (const force of [false, true]) {
      const sources = cdiSources();
      await refresh(state, sources, NOW, force);
      expect(sources.dailyCdi).toHaveBeenCalledWith("2026-09-24", "2026-09-24");
    }
    const complete = run(state, { type: "record-rate-indexes", rateIndexes: cdi });
    const sources = cdiSources();
    expect(await refresh(complete, sources, NOW, true)).toEqual([]);
    expect(sources.dailyCdi).not.toHaveBeenCalled();
  });
  it("asks only after more than a day since success, unless forced", async () => {
    const invested = run(emptyPortfolio(), register("CDB CDI"), application(1, "2026-09-04"));
    for (const at of [NOW, "2026-09-24T14:32:00"] as const) {
      const state = run(invested, { type: "record-fetch", kind: "rate-indexes", at });
      const sources = cdiSources();
      expect(await refresh(state, sources, NOW, false)).toEqual([]);
      expect(sources.dailyCdi).not.toHaveBeenCalled();
      expect(await refresh(state, sources, NOW, true)).toHaveLength(2);
    }
    const old = run(invested, { type: "record-fetch", kind: "rate-indexes", at: "2026-09-24T14:31:59" });
    expect(await refresh(old, cdiSources(), NOW, false)).toHaveLength(2);
  });
  it("asks from the earliest application of a CDI bond through yesterday and records the successful fetch", async () => {
    const state = run(emptyPortfolio(), register("CDB CDI"), application(1, "2026-09-04"), register("LCI CDI"), application(2, "2026-01-02"));
    const sources = cdiSources();
    expect(await refresh(state, sources, NOW, false)).toEqual([
      { type: "record-rate-indexes", rateIndexes: cdi },
      { type: "record-fetch", kind: "rate-indexes", at: NOW },
    ]);
    expect(sources.dailyCdi).toHaveBeenCalledWith("2026-01-02", "2026-09-24");
  });
});

function cdiSources() {
  return { ...liveSources(), dailyCdi: vi.fn(async (_from: IsoDate, _to: IsoDate): Promise<RateIndex[]> => cdi) };
}

function register(ticker: string, indexer: "cdi-percentage" | "fixed-rate" | "ipca-plus" = "cdi-percentage"): PortfolioCommand {
  return { type: "save-asset", asset: { ticker, assetClass: "fixed-income", bond: {
    kind: "private-bond", bondType: "cdb", indexer, rate: decimal(110), maturityDate: "2028-01-02",
  } } };
}

const application = (asset: number, date: IsoDate): PortfolioCommand => ({ type: "save-trade", trade: { asset, kind: "buy", date, amount: 100_000 } });

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  for (const command of commands) {
    const result = apply(state, command, "2026-09-25");
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}
