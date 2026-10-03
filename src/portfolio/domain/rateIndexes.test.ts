import { describe, expect, it } from "vitest";
import { apply, decimal, emptyPortfolio } from "@/portfolio/domain";

describe("recording rate indexes", () => {
  it("refuses malformed indexes without recording anything", () => {
    for (const rateIndexes of [null, [{ kind: "selic", date: "2026-09-04", rate: decimal(0.05) }],
      [{ kind: "cdi", date: "2026-02-30", rate: decimal(0.05) }],
      [{ kind: "cdi", date: "2026-09-04", rate: 0.05 }],
      [{ kind: "cdi", date: "2026-09-04", rate: -1 }], [null]]) {
      const state = emptyPortfolio();
      expect(apply(state, { type: "record-rate-indexes", rateIndexes } as never, "2026-09-25").ok).toBe(false);
      expect(state.rateIndexes).toEqual([]);
    }
    expect(apply(emptyPortfolio(), { type: "record-rate-indexes", rateIndexes: [{ kind: "cdi", date: "2026-09-04", rate: 0 }] }, "2026-09-25").ok).toBe(true);
  });
  it("merges daily CDI rates and replaces a rate received again for the same date", () => {
    const first = apply(emptyPortfolio(), { type: "record-rate-indexes", rateIndexes: [
      { kind: "cdi", date: "2026-09-04", rate: decimal(0.05) },
    ] }, "2026-09-25");
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);
    const next = apply(first.value, { type: "record-rate-indexes", rateIndexes: [
      { kind: "cdi", date: "2026-09-08", rate: decimal(0.06) },
      { kind: "cdi", date: "2026-09-04", rate: decimal(0.04) },
    ] }, "2026-09-25");
    expect(next).toMatchObject({ ok: true, value: { rateIndexes: [
      { kind: "cdi", date: "2026-09-04", rate: decimal(0.04) },
      { kind: "cdi", date: "2026-09-08", rate: decimal(0.06) },
    ] } });
  });
});
