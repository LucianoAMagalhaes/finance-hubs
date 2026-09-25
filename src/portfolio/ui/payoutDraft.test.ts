import { describe, expect, it } from "vitest";
import { checkPayoutDraft, emptyPayoutDraft, payoutDraftFrom } from "./payoutDraft";

describe("the payout's draft", () => {
  it("reads the typed amount as whole cents", () => {
    expect(checkPayoutDraft({ id: null, asset: "3", kind: "fund-income", date: "2026-08-14", amount: "1.100,50" })).toEqual({
      payout: { asset: 3, kind: "fund-income", date: "2026-08-14", amount: 110_050 },
      error: null,
    });
  });

  it("a new draft is a dividend, proposes today and the asset it was opened from", () => {
    expect(emptyPayoutDraft("2026-09-25", 4)).toEqual({ id: null, asset: "4", kind: "dividend", date: "2026-09-25", amount: "" });
    expect(emptyPayoutDraft("2026-09-25", null).asset).toBe("");
  });

  it("a saved payout opens as typed, and goes back as its correction", () => {
    const draft = payoutDraftFrom({ id: 7, asset: 3, kind: "interest-on-equity", date: "2026-05-20", amount: 5_412 });

    expect(draft).toEqual({ id: 7, asset: "3", kind: "interest-on-equity", date: "2026-05-20", amount: "54,12" });
    expect(checkPayoutDraft(draft).payout).toEqual({ id: 7, asset: 3, kind: "interest-on-equity", date: "2026-05-20", amount: 5_412 });
  });

  it("says what it cannot read", () => {
    const good = { id: null, asset: "3", kind: "dividend", date: "2026-08-14", amount: "10" } as const;

    expect(checkPayoutDraft({ ...good, asset: "" }).error).toBe("Escolha o ativo.");
    expect(checkPayoutDraft({ ...good, amount: "dez" }).error).toBe("Informe o valor recebido em reais, como 54,12.");
  });
});
