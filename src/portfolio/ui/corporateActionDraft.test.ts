import { describe, expect, it } from "vitest";
import { checkCorporateActionDraft, corporateActionDraftFrom, describeRatio, emptyCorporateActionDraft } from "./corporateActionDraft";

describe("the corporate action's draft", () => {
  it("a new draft is a split, proposes today and the asset it was opened from", () => {
    expect(emptyCorporateActionDraft("2026-09-25", 4)).toEqual({ id: null, asset: 4, kind: "split", date: "2026-09-25", left: "", right: "" });
  });

  it("a split and a reverse split are read as the company announces them: 1 para 4, 10 para 1", () => {
    const draft = { id: null, asset: 4, kind: "split", date: "2026-03-10", left: "1", right: "4" } as const;

    expect(checkCorporateActionDraft(draft)).toEqual({
      action: { asset: 4, kind: "split", date: "2026-03-10", ratio: { from: 1, to: 4 } },
      error: null,
    });
    expect(checkCorporateActionDraft({ ...draft, kind: "reverse-split", left: "10", right: " 1 " }).action.ratio).toEqual({ from: 10, to: 1 });
  });

  it("a bonus is read as 1 nova para cada 10, which makes 10 into 11", () => {
    const draft = { id: null, asset: 4, kind: "bonus", date: "2026-03-10", left: "1", right: "10" } as const;

    expect(checkCorporateActionDraft(draft).action.ratio).toEqual({ from: 10, to: 11 });
  });

  it("says when the ratio isn't two whole numbers greater than zero", () => {
    const draft = { id: null, asset: 4, kind: "split", date: "2026-03-10", left: "1", right: "4" } as const;
    const error = "Informe a proporção com dois números inteiros, como 1 para 4.";

    for (const [left, right] of [["", "4"], ["1", "0"], ["1,5", "4"], ["um", "4"]]) {
      expect(checkCorporateActionDraft({ ...draft, left: left!, right: right! }).error).toBe(error);
    }
  });

  it("a saved action opens as typed, and goes back as its correction", () => {
    const bonus = corporateActionDraftFrom({ id: 7, asset: 3, kind: "bonus", date: "2026-04-10", ratio: { from: 10, to: 13 }, status: "confirmed" });
    const split = corporateActionDraftFrom({ id: 8, asset: 3, kind: "split", date: "2026-05-10", ratio: { from: 1, to: 4 }, status: "confirmed" });

    expect(bonus).toEqual({ id: 7, asset: 3, kind: "bonus", date: "2026-04-10", left: "3", right: "10" });
    expect(split).toMatchObject({ left: "1", right: "4" });
    expect(checkCorporateActionDraft(bonus).action).toEqual({ id: 7, asset: 3, kind: "bonus", date: "2026-04-10", ratio: { from: 10, to: 13 } });
  });

  it("describes the ratio as the list shows it", () => {
    expect(describeRatio("split", { from: 1, to: 4 })).toBe("1:4");
    expect(describeRatio("reverse-split", { from: 10, to: 1 })).toBe("10:1");
    expect(describeRatio("bonus", { from: 10, to: 11 })).toBe("1 nova para cada 10");
    expect(describeRatio("bonus", { from: 10, to: 13 })).toBe("3 novas para cada 10");
  });
});
