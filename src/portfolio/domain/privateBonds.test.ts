import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  projectPortfolio,
  type AssetToSave,
  type AssetView,
  type IsoDate,
  type PortfolioCommand,
  type PortfolioState,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

const CDB: AssetToSave = {
  ticker: "CDB Inter 2028",
  assetClass: "fixed-income",
  bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12.5), maturityDate: "2028-01-02" },
};

describe("registering a private bond", () => {
  it("creates it in Renda Fixa with its name as typed, its type, indexer, rate and maturity", () => {
    const state = applyOk(emptyPortfolio(), { type: "save-asset", asset: { ...CDB, ticker: "  CDB Inter 2028 " } });

    expect(state.assets).toEqual([{ id: 1, sourceId: null, ...CDB }]);
    expect(bond(state, "CDB Inter 2028")).toMatchObject({
      assetClass: "fixed-income",
      quantity: 0,
      currentValue: 0,
      bond: CDB.bond,
      tags: ["zero-position"],
    });
  });

  it("the name is unique regardless of case, in every class", () => {
    const state = applyOk(emptyPortfolio(), save(CDB), save({ ticker: "PETR4", assetClass: "domestic-stocks" }));

    expect(apply(state, save({ ...CDB, ticker: "cdb inter 2028" }), TODAY)).toEqual({
      ok: false,
      error: "Já existe um ativo cdb inter 2028 na carteira.",
    });
    expect(apply(state, save({ ...CDB, ticker: "Petr4" }), TODAY)).toEqual({ ok: false, error: "Já existe um ativo Petr4 na carteira." });
  });

  it("refuses a bond with no name, an unknown way, type or indexer, a rate not above zero and a bad maturity", () => {
    const refused = (asset: AssetToSave) => apply(emptyPortfolio(), save(asset), TODAY);

    expect(refused({ ...CDB, ticker: "  " })).toEqual({ ok: false, error: "Informe o nome do título." });
    expect(refused({ ...CDB, bond: undefined })).toEqual({ ok: false, error: "Escolha Tesouro Direto ou título privado." });
    expect(refused({ ...CDB, bond: { ...CDB.bond!, kind: "savings" as never } })).toEqual({
      ok: false,
      error: "Escolha Tesouro Direto ou título privado.",
    });
    expect(refused({ ...CDB, bond: { ...CDB.bond!, bondType: "poupanca" as never } })).toEqual({
      ok: false,
      error: "Escolha o tipo do título.",
    });
    expect(refused({ ...CDB, bond: { ...CDB.bond!, indexer: "selic" as never } })).toEqual({
      ok: false,
      error: "Escolha o indexador do título.",
    });
    expect(refused({ ...CDB, bond: { ...CDB.bond!, rate: 0 } })).toEqual({ ok: false, error: "A taxa tem que ser maior que zero." });
    expect(refused({ ...CDB, bond: { ...CDB.bond!, rate: 12.5 } })).toEqual({ ok: false, error: "A taxa aceita até 8 casas decimais." });
    expect(refused({ ...CDB, bond: { ...CDB.bond!, maturityDate: "2028-02-30" as IsoDate } })).toEqual({
      ok: false,
      error: "Informe um vencimento válido.",
    });
  });

  it("a correction changes the name, type, indexer, rate and maturity", () => {
    const state = applyOk(emptyPortfolio(), save(CDB));
    const corrected: AssetToSave = {
      id: 1,
      ticker: "LCI Inter 2029",
      assetClass: "fixed-income",
      bond: { kind: "private-bond", bondType: "lci", indexer: "cdi-percentage", rate: decimal(95), maturityDate: "2029-06-01" },
    };

    expect(applyOk(state, save(corrected)).assets).toEqual([{ ...corrected, sourceId: null }]);
  });

  it("the way of the bond never changes after the registration", () => {
    const state = applyOk(emptyPortfolio(), save(CDB));

    expect(
      apply(
        state,
        save({ id: 1, ticker: "Tesouro IPCA+ 2035", assetClass: "fixed-income", bond: { kind: "treasury-bond" } as never }),
        TODAY,
      ),
    ).toEqual({
      ok: false,
      error: "O jeito do título não muda depois do cadastro.",
    });
  });

  it("is deleted by the rule of the other assets", () => {
    const state = applyOk(emptyPortfolio(), save(CDB));

    expect(applyOk(state, { type: "delete-asset", id: 1 }).assets).toEqual([]);
    expect(apply(applyOk(state, apply10k(1, "2026-01-02")), { type: "delete-asset", id: 1 }, TODAY)).toEqual({
      ok: false,
      error: "CDB Inter 2028 tem operações: um ativo com histórico fica na carteira para sempre.",
    });
  });
});

describe("an application in a private bond", () => {
  const registered = applyOk(emptyPortfolio(), save(CDB));

  it("is recorded in reais, with no quantity nor price", () => {
    const state = applyOk(registered, apply10k(1, "2026-01-02"));

    expect(state.trades).toEqual([{ id: 1, asset: 1, kind: "buy", date: "2026-01-02", amount: 1_000_000 }]);
  });

  it("the first application becomes shares at R$ 1,00", () => {
    const state = applyOk(registered, apply10k(1, "2026-01-02"));

    expect(bond(state, "CDB Inter 2028", "2026-01-02")).toMatchObject({
      quantity: decimal(10_000),
      averagePrice: 100,
      cost: 1_000_000,
      quote: 100,
      currentValue: 1_000_000,
      tags: [],
    });
    expect(bond(state, "CDB Inter 2028", "2026-01-02").trades).toEqual([
      expect.objectContaining({ kind: "buy", quantity: decimal(10_000), unitPrice: decimal(1), total: 1_000_000 }),
    ]);
  });

  it("a fixed rate grows by (1 + rate)^(business days ÷ 252), up to yesterday", () => {
    const state = applyOk(registered, apply10k(1, "2026-01-02"));

    // 183 business days from 02/01 to 24/09: 1,125^(183 ÷ 252) = 1,08929742
    const view = bond(state, "CDB Inter 2028");
    expect(view.quote).toBeCloseTo(108.929742, 8);
    expect(view.currentValue).toBeCloseTo(1_089_297.42, 6);
    expect(view.unrealizedGain).toBeCloseTo(89_297.42, 6);
    expect(view.totalGain).toBeCloseTo(89_297.42, 6);
  });

  it("an ANBIMA holiday doesn't yield", () => {
    const state = applyOk(registered, apply10k(1, "2026-09-04"));

    // Friday to Tuesday over the weekend and the Independência: one business day, 1,125^(1 ÷ 252).
    expect(bond(state, "CDB Inter 2028", "2026-09-08").quote).toBeCloseTo(100.04675, 8);
    expect(bond(state, "CDB Inter 2028", "2026-09-07").quote).toBeCloseTo(100.04675, 8);
  });

  it("a later application buys shares at the accrued price of its date, and yields only from it", () => {
    const state = applyOk(registered, apply10k(1, "2026-01-02"), application(1, "2026-05-04", 500_000));

    // 81 business days to 04/05: 1,03858461; R$ 5.000 ÷ 1,03858461 = 4.814,24426268 shares.
    const view = bond(state, "CDB Inter 2028");
    expect(view.quantity).toBe(10_000_00000000 + 4_814_24426268);
    expect(view.cost).toBe(1_500_000);
    expect(view.trades[0]).toMatchObject({ date: "2026-05-04", quantity: 4_814_24426268, unitPrice: 1_03858461, total: 500_000 });
    // Both at 1,08929742 today.
    expect(view.currentValue).toBeCloseTo(1_613_711.81, 1);
  });

  it("an application entered out of date order gives the same shares", () => {
    const inOrder = applyOk(registered, apply10k(1, "2026-01-02"), application(1, "2026-05-04", 500_000));
    const outOfOrder = applyOk(registered, application(1, "2026-05-04", 500_000), apply10k(1, "2026-01-02"));

    expect(bond(outOfOrder, "CDB Inter 2028").quantity).toBe(bond(inOrder, "CDB Inter 2028").quantity);
  });

  it("correcting the rate recalculates the bond from the first application", () => {
    const state = applyOk(registered, apply10k(1, "2026-01-02"), application(1, "2026-05-04", 500_000));

    const corrected = applyOk(state, save({ ...CDB, id: 1, bond: { ...CDB.bond!, rate: decimal(10) } }));

    // 1,10^(81 ÷ 252) = 1,03110951 at the second application; 1,10^(183 ÷ 252) = 1,07166482 today.
    const view = bond(corrected, "CDB Inter 2028");
    expect(view.trades[0]).toMatchObject({ unitPrice: 1_03110951 });
    expect(view.quote).toBeCloseTo(107.166482, 8);
    expect(view.cost).toBe(1_500_000);
  });

  it('a bond of % do CDI or IPCA + is worth its cost, tagged "no-rate-index", until the indexes come', () => {
    const state = applyOk(
      emptyPortfolio(),
      save({ ...CDB, bond: { ...CDB.bond!, indexer: "cdi-percentage", rate: decimal(110) } }),
      save({ ...CDB, ticker: "LCA BB 2027", bond: { ...CDB.bond!, bondType: "lca", indexer: "ipca-plus", rate: decimal(6.15) } }),
      apply10k(1, "2026-01-02"),
      apply10k(2, "2026-01-02"),
    );

    for (const name of ["CDB Inter 2028", "LCA BB 2027"]) {
      expect(bond(state, name)).toMatchObject({
        quantity: decimal(10_000),
        cost: 1_000_000,
        quote: null,
        currentValue: 1_000_000,
        unrealizedGain: 0,
        tags: ["no-rate-index"],
      });
    }
  });

  it("refuses a quantity and a price in a private bond, and an amount in reais in any other asset", () => {
    const state = applyOk(registered, save({ ticker: "PETR4", assetClass: "domestic-stocks" }));
    const trade = (t: object) => apply(state, { type: "save-trade", trade: t as never }, TODAY);

    expect(trade({ asset: 1, kind: "buy", date: "2026-01-02", quantity: decimal(10), unitPrice: decimal(1) })).toEqual({
      ok: false,
      error: "O título privado recebe o valor em reais, sem quantidade nem preço.",
    });
    expect(trade({ asset: 2, kind: "buy", date: "2026-01-02", amount: 1_000_000 })).toEqual({
      ok: false,
      error: "Só o título privado recebe o valor em reais.",
    });
  });

  it("refuses an amount that is not whole cents above zero, and a date after today", () => {
    const refused = (amount: number, date = "2026-01-02") => apply(registered, application(1, date, amount), TODAY);

    expect(refused(0)).toEqual({ ok: false, error: "O valor tem que ser maior que zero." });
    expect(refused(10.5)).toEqual({ ok: false, error: "O valor aceita até 2 casas decimais." });
    expect(refused(100, "2026-09-26")).toEqual({ ok: false, error: "A operação não pode ter data depois de hoje." });
  });
});

describe("Renda Fixa in the portfolio", () => {
  it("adds to the class's value and gain, its share and how far it is from the target", () => {
    const state = applyOk(
      emptyPortfolio(),
      save(CDB),
      save({ ticker: "PETR4", assetClass: "domestic-stocks" }),
      apply10k(1, "2026-09-25"),
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-09-25", quantity: decimal(100), unitPrice: decimal(100) } },
    );

    const view = projectPortfolio(state, TODAY);
    const fixedIncome = view.classes.find((c) => c.key === "fixed-income")!;
    expect(view.currentValue).toBe(2_000_000);
    expect(fixedIncome).toMatchObject({ value: 1_000_000, share: 50, target: 45, assetCount: 1 });
    expect(fixedIncome.toTarget).toBeCloseTo(-100_000, 6); // 45% of R$ 20.000 − R$ 10.000

    const grown = projectPortfolio(state, "2026-11-23");
    expect(grown.classes.find((c) => c.key === "fixed-income")!.totalGain).toBeGreaterThan(0);
    expect(grown.totalGain).toBe(grown.classes.find((c) => c.key === "fixed-income")!.totalGain);
  });
});

// ---------------------------------------------------------------- helpers

const save = (asset: AssetToSave): PortfolioCommand => ({ type: "save-asset", asset });

/** An application of R$ 10.000 on the date. */
const apply10k = (asset: number, date: string): PortfolioCommand => application(asset, date, 1_000_000);

const application = (asset: number, date: string, amount: number): PortfolioCommand => ({
  type: "save-trade",
  trade: { asset, kind: "buy", date: date as IsoDate, amount },
});

function applyOk(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  for (const command of commands) {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}

function bond(state: PortfolioState, name: string, today: IsoDate = TODAY): AssetView {
  return projectPortfolio(state, today)
    .classes.flatMap((c) => c.assets)
    .find((a) => a.ticker === name)!;
}
