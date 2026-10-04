import { describe, expect, it } from "vitest";
import { draftFrom, readDraft } from "./scoreDraft";

describe("the manual score draft", () => {
  it("opens an absent score as blank and a zero score as zero", () => {
    expect(draftFrom(null)).toEqual({ score: "" });
    expect(draftFrom(0)).toEqual({ score: "0" });
    expect(draftFrom(10)).toEqual({ score: "10" });
  });
  it.each(["", "  ", "1,5", "1.5", "abc", "Infinity", "0xA", "1e1", "-1", "11"])("refuses unreadable or invalid text %s and preserves the draft", (score) => {
    const draft = { score };
    expect(readDraft(draft)).toEqual({ ok: false, error: "Informe uma nota inteira de 0 a 10." });
    expect(draft.score).toBe(score);
  });
  it.each([["0", 0], [" 10 ", 10], ["5", 5]] as const)("reads %s as an integer score", (score, expected) => {
    expect(readDraft({ score })).toEqual({ ok: true, value: expected });
  });
});
