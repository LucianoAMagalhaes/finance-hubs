import { describe, expect, it } from "vitest";
import { emptyState, DEFAULT_PERCENTAGES, projectMonth, type Percentages } from "@/domain";
import { checkDraft, previewPercentages, draftFrom, type Draft } from "./percentagesDraft";

/** The draft of the default percentages: 30 / 25 / 15 / 15 / 10 / 5. */
const DEFAULT = draftFrom(projectMonth(emptyState(), "2026-09").jars);

describe("the percentages draft", () => {
  it("starts with the percentages the month shows, written as the person would see them in the field", () => {
    expect(DEFAULT).toEqual({
      "fixed-costs": "30",
      "financial-freedom": "25",
      comfort: "15",
      goals: "15",
      knowledge: "10",
      pleasures: "5",
    });
  });

  it("a valid draft returns the read percentages, no error, and the sum; surrounding spaces do not get in the way", () => {
    expect(checkDraft({ ...DEFAULT, goals: " 5 " })).toEqual({
      percentages: { ...DEFAULT_PERCENTAGES, goals: 5 },
      error: null,
      sum: 90,
    });
  });

  it.each([
    ["blank", ""],
    ["unreadable", "abc"],
  ])("a %s field is refused, and counts as zero in the sum", (_, text) => {
    const checked = checkDraft({ ...DEFAULT, comfort: text });

    expect(checked.error).toBe("Conforto: o percentual é um inteiro de 0 a 100.");
    expect(checked.sum).toBe(85);
  });

  it("above 100 or negative is refused; in the sum and the preview, it is clamped to 100 or 0", () => {
    const over: Draft = { ...DEFAULT, "fixed-costs": "150", pleasures: "-5" };

    expect(checkDraft(over)).toMatchObject({ error: "Custos Fixos: o percentual é um inteiro de 0 a 100.", sum: 165 });
    expect(previewPercentages(over)).toEqual<Percentages>({ ...DEFAULT_PERCENTAGES, "fixed-costs": 100, pleasures: 0 });
    expect(checkDraft({ ...DEFAULT, pleasures: "-5" })).toMatchObject({ error: "Prazeres: o percentual é um inteiro de 0 a 100.", sum: 95 });
  });

  it("the preview counts as zero what does not read as a number", () => {
    expect(previewPercentages({ ...DEFAULT, goals: "", knowledge: "x" })).toEqual<Percentages>({
      ...DEFAULT_PERCENTAGES,
      goals: 0,
      knowledge: 0,
    });
  });
});
