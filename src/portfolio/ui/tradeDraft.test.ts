import { describe, expect, it } from "vitest";
import { decimal } from "@/portfolio/domain";
import { checkTradeDraft, emptyTradeDraft, tradeDraftFrom } from "./tradeDraft";

describe("the trade's draft", () => {
  it("reads the typed quantity and price as exact decimals, with the total they make", () => {
    const checked = checkTradeDraft({ id: null, asset: "3", kind: "buy", date: "2026-03-10", quantity: "0,00321", unitPrice: "612.000,00" });

    expect(checked).toEqual({
      trade: { asset: 3, kind: "buy", date: "2026-03-10", quantity: 321000, unitPrice: 612000_00000000 },
      error: null,
      total: 196_452,
    });
  });

  it("a new draft is a buy, proposes today and the asset it was opened from", () => {
    expect(emptyTradeDraft("2026-09-25", 4)).toEqual({ id: null, asset: "4", kind: "buy", date: "2026-09-25", quantity: "", unitPrice: "" });
    expect(emptyTradeDraft("2026-09-25", null).asset).toBe("");
  });

  it("a saved trade opens as typed, and goes back as its correction", () => {
    const draft = tradeDraftFrom({ id: 7, asset: 3, kind: "sell", date: "2026-04-10", quantity: decimal(0.5), unitPrice: decimal(36.8) });

    expect(draft).toEqual({ id: 7, asset: "3", kind: "sell", date: "2026-04-10", quantity: "0,5", unitPrice: "36,8" });
    expect(checkTradeDraft(draft).trade).toEqual({
      id: 7,
      asset: 3,
      kind: "sell",
      date: "2026-04-10",
      quantity: decimal(0.5),
      unitPrice: decimal(36.8),
    });
  });

  it("says what it cannot read, and has no total until both numbers read", () => {
    const good = { id: null, asset: "3", kind: "buy", date: "2026-03-10", quantity: "10", unitPrice: "36,80" } as const;

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
