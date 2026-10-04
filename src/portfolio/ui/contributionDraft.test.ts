import { describe, expect, it } from "vitest";
import { readDraft } from "./contributionDraft";

describe("the contribution draft", () => {
  it.each([["0,01", 1], ["1.234,56", 123456], ["1234.56", 123456], ["R$ 10,00", 1000]] as const)("reads %s in reais as %s cents", (contribution, expected) => {
    expect(readDraft({ contribution })).toEqual({ ok: true, value: expected });
  });
  it.each(["", " ", "0", "-1", "NaN", "Infinity", "1e3", "0x10", "1,001", "abc", "99999999999999999999"])("refuses %s in Portuguese and preserves typed text", contribution => {
    const draft = { contribution };
    expect(readDraft(draft)).toEqual({ ok: false, error: "Informe um aporte em reais com centavos, maior que zero e dentro do valor suportado." });
    expect(draft).toEqual({ contribution });
  });
});
