import { describe, expect, it } from "vitest";
import { DEFAULT_TARGETS } from "@/portfolio/domain";
import { checkDraft, draftFrom } from "./targetsDraft";

const DEFAULT = draftFrom(DEFAULT_TARGETS);

describe("the targets draft", () => {
  it("starts with the current targets, written as the person sees them in the field", () => {
    expect(DEFAULT).toEqual({
      "domestic-stocks": "25",
      "international-stocks": "15",
      "fixed-income": "45",
      "real-estate-funds": "10",
      crypto: "5",
    });
  });

  it("a draft that closes at 100 reads the targets, has no error and says so", () => {
    expect(checkDraft({ ...DEFAULT, crypto: " 0 ", "fixed-income": "50" })).toEqual({
      targets: { ...DEFAULT_TARGETS, crypto: 0, "fixed-income": 50 },
      error: null,
      sum: "Soma 100%",
      closes: true,
    });
  });

  it("says how much is missing, or how much it passes, from 100", () => {
    expect(checkDraft({ ...DEFAULT, crypto: "0" }).sum).toBe("Soma 95% · faltam 5");
    expect(checkDraft({ ...DEFAULT, crypto: "4" }).sum).toBe("Soma 99% · falta 1");
    expect(checkDraft({ ...DEFAULT, crypto: "12" }).sum).toBe("Soma 107% · passa 7");
  });

  it("the error is the domain's, the same one the server would give", () => {
    expect(checkDraft({ ...DEFAULT, crypto: "0" }).error).toBe("Os alvos somam 95%: faltam 5 pontos para 100.");
    expect(checkDraft({ ...DEFAULT, crypto: "2,5" }).error).toBe("Cripto: o alvo é um inteiro de 0 a 100.");
  });

  it.each([
    ["blank", ""],
    ["unreadable", "abc"],
  ])("a %s field is refused, and counts as zero in the sum", (_, text) => {
    const checked = checkDraft({ ...DEFAULT, "fixed-income": text });

    expect(checked.error).toBe("Renda Fixa: o alvo é um inteiro de 0 a 100.");
    expect(checked.sum).toBe("Soma 55% · faltam 45");
  });
});
