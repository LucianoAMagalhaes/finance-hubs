import { describe, expect, it } from "vitest";
import { decimal, exchangeRate } from "@/portfolio/domain";
import { checkTradeDraft, emptyTradeDraft, tradeDraftFrom } from "./tradeDraft";

describe("the trade's draft", () => {
  it("reads the typed quantity and price as exact decimals, with the total they make", () => {
    const checked = checkTradeDraft(
      { id: null, asset: "3", kind: "buy", date: "2026-03-10", quantity: "0,00321", unitPrice: "612.000,00", exchangeRate: "" },
      "BRL",
    );

    expect(checked).toEqual({
      trade: { asset: 3, kind: "buy", date: "2026-03-10", quantity: 321000, unitPrice: 612000_00000000, exchangeRate: null },
      error: null,
      total: 196_452,
      totalInReais: null,
    });
  });

  it("a new draft is a buy, proposes today and the asset it was opened from", () => {
    expect(emptyTradeDraft("2026-09-25", 4)).toEqual({
      id: null,
      asset: "4",
      kind: "buy",
      date: "2026-09-25",
      quantity: "",
      unitPrice: "",
      exchangeRate: "",
    });
    expect(emptyTradeDraft("2026-09-25", null).asset).toBe("");
  });

  it("a saved trade opens as typed, and goes back as its correction", () => {
    const draft = tradeDraftFrom({
      id: 7,
      asset: 3,
      kind: "sell",
      date: "2026-04-10",
      quantity: decimal(0.5),
      unitPrice: decimal(36.8),
      exchangeRate: null,
    });

    expect(draft).toEqual({ id: 7, asset: "3", kind: "sell", date: "2026-04-10", quantity: "0,5", unitPrice: "36,8", exchangeRate: "" });
    expect(checkTradeDraft(draft, "BRL").trade).toEqual({
      id: 7,
      asset: 3,
      kind: "sell",
      date: "2026-04-10",
      quantity: decimal(0.5),
      unitPrice: decimal(36.8),
      exchangeRate: null,
    });
  });

  it("says what it cannot read, and has no total until both numbers read", () => {
    const good = { id: null, asset: "3", kind: "buy", date: "2026-03-10", quantity: "10", unitPrice: "36,80", exchangeRate: "" } as const;

    expect(checkTradeDraft({ ...good, asset: "" }, "BRL")).toMatchObject({ error: "Escolha o ativo.", total: 36_800 });
    expect(checkTradeDraft({ ...good, quantity: "dez" }, "BRL")).toMatchObject({
      error: "Informe a quantidade, como 100 ou 0,5, com até 8 casas decimais.",
      total: null,
    });
    expect(checkTradeDraft({ ...good, unitPrice: "" }, "BRL")).toMatchObject({
      error: "Informe o preço unitário, como 36,80, com até 8 casas decimais.",
      total: null,
    });
  });

  it("in dollars, reads the exchange rate and shows the total in dollars and in reais", () => {
    const draft = { id: null, asset: "5", kind: "buy", date: "2026-09-18", quantity: "10", unitPrice: "87,645", exchangeRate: "5,1575" } as const;

    const checked = checkTradeDraft(draft, "USD");

    expect(checked.trade).toMatchObject({ exchangeRate: exchangeRate(5.1575) });
    expect(checked.error).toBeNull();
    expect(checked.total).toBe(87_645);
    expect(checked.totalInReais).toBeCloseTo(452_029.0875, 6); // US$ 876,45 × 5,1575
    expect(checkTradeDraft({ ...draft, exchangeRate: "5.1575" }, "USD").trade.exchangeRate).toBe(51575);
  });

  it("in dollars, an empty or unreadable exchange rate is said, and there is no total in reais", () => {
    const draft = { id: null, asset: "5", kind: "buy", date: "2026-09-18", quantity: "10", unitPrice: "87,645", exchangeRate: "" } as const;
    const said = { error: "Informe o câmbio, como 5,4213, com até 4 casas decimais.", total: 87_645, totalInReais: null };

    expect(checkTradeDraft(draft, "USD")).toMatchObject(said);
    expect(checkTradeDraft({ ...draft, exchangeRate: "5,42131" }, "USD")).toMatchObject(said);
  });

  it("an exchange rate left in the draft of an asset in reais is not sent", () => {
    const draft = { id: null, asset: "3", kind: "buy", date: "2026-03-10", quantity: "10", unitPrice: "36,80", exchangeRate: "5,20" } as const;

    expect(checkTradeDraft(draft, "BRL")).toMatchObject({ error: null, trade: { exchangeRate: null } });
  });
});
