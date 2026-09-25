import { describe, expect, it } from "vitest";
import { checkTradeDraft, emptyTradeDraft } from "./tradeDraft";

describe("the buy's draft", () => {
  it("reads the typed quantity and price as exact decimals, with the total they make", () => {
    const checked = checkTradeDraft({ asset: "3", date: "2026-03-10", quantity: "0,00321", unitPrice: "612.000,00" });

    expect(checked).toEqual({
      trade: { asset: 3, kind: "buy", date: "2026-03-10", quantity: 321000, unitPrice: 612000_00000000 },
      error: null,
      total: 196_452,
    });
  });

  it("a new draft proposes today and the asset it was opened from", () => {
    expect(emptyTradeDraft("2026-09-25", 4)).toEqual({ asset: "4", date: "2026-09-25", quantity: "", unitPrice: "" });
    expect(emptyTradeDraft("2026-09-25", null).asset).toBe("");
  });

  it("says what it cannot read, and has no total until both numbers read", () => {
    const good = { asset: "3", date: "2026-03-10", quantity: "10", unitPrice: "36,80" };

    expect(checkTradeDraft({ ...good, asset: "" })).toMatchObject({ error: "Escolha o ativo.", total: 36_800 });
    expect(checkTradeDraft({ ...good, quantity: "dez" })).toMatchObject({
      error: "Informe a quantidade, como 100 ou 0,5, com até 8 casas decimais.",
      total: null,
    });
    expect(checkTradeDraft({ ...good, unitPrice: "" })).toMatchObject({
      error: "Informe o preço unitário, como 36,80, com até 8 casas decimais.",
      total: null,
    });
  });
});
