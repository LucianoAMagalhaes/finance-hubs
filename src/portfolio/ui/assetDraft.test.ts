import { describe, expect, it } from "vitest";
import { decimal } from "@/portfolio/domain";
import { assetDraftFrom, checkAssetDraft, describeBond, emptyAssetDraft } from "./assetDraft";

describe("the asset's draft", () => {
  it("a stock sends its ticker and class, and no bond", () => {
    const draft = { ...emptyAssetDraft("domestic-stocks"), ticker: "petr4" };

    expect(checkAssetDraft(draft, null)).toEqual({ asset: { ticker: "petr4", assetClass: "domestic-stocks" }, error: null });
  });

  it("a private bond reads the rate with a comma and up to two places, and sends its bond", () => {
    const draft = {
      ...emptyAssetDraft("fixed-income"),
      ticker: "CDB Inter 2028",
      bondType: "cdb",
      indexer: "fixed-rate",
      rate: "12,5",
      maturityDate: "2028-01-02",
    } as const;

    expect(checkAssetDraft(draft, null)).toEqual({
      asset: {
        ticker: "CDB Inter 2028",
        assetClass: "fixed-income",
        bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12.5), maturityDate: "2028-01-02" },
      },
      error: null,
    });
    expect(checkAssetDraft({ ...draft, rate: "6,15" }, 3).asset).toMatchObject({ id: 3, bond: { rate: decimal(6.15) } });
    expect(checkAssetDraft({ ...draft, rate: "110" }, null).asset.bond).toMatchObject({ rate: decimal(110) });
  });

  it("says when the rate doesn't read, has more than two places, or the maturity is missing", () => {
    const draft = { ...emptyAssetDraft("fixed-income"), ticker: "CDB Inter 2028", rate: "12,5", maturityDate: "2028-01-02" };
    const unreadable = "Informe a taxa, como 110 ou 12,5, com até 2 casas decimais.";

    expect(checkAssetDraft({ ...draft, rate: "" }, null).error).toBe(unreadable);
    expect(checkAssetDraft({ ...draft, rate: "12,555" }, null).error).toBe(unreadable);
    expect(checkAssetDraft({ ...draft, rate: "doze" }, null).error).toBe(unreadable);
    expect(checkAssetDraft({ ...draft, maturityDate: "" }, null).error).toBe("Informe o vencimento.");
  });

  it("a saved bond opens as typed", () => {
    const bond = {
      kind: "private-bond",
      bondType: "lci",
      indexer: "cdi-percentage",
      rate: decimal(95.5),
      maturityDate: "2029-06-01",
    } as const;

    expect(assetDraftFrom({ id: 3, ticker: "LCI Inter 2029", assetClass: "fixed-income", sourceId: null, bond })).toEqual({
      ticker: "LCI Inter 2029",
      assetClass: "fixed-income",
      bondKind: "private-bond",
      bondType: "lci",
      indexer: "cdi-percentage",
      rate: "95,5",
      maturityDate: "2029-06-01",
    });
  });
});

describe("the bond's line on the row", () => {
  const bond = { kind: "private-bond", bondType: "cdb", maturityDate: "2028-01-02" } as const;

  it("says the indexer with its rate, and the maturity", () => {
    expect(describeBond({ ...bond, indexer: "cdi-percentage", rate: decimal(110) })).toBe("110% do CDI · vence 02/01/2028");
    expect(describeBond({ ...bond, indexer: "fixed-rate", rate: decimal(12.5) })).toBe("12,5% a.a. · vence 02/01/2028");
    expect(describeBond({ ...bond, indexer: "ipca-plus", rate: decimal(6.15) })).toBe("IPCA + 6,15% · vence 02/01/2028");
  });
});
