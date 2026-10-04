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

const CDB = {
  ticker: "CDB Inter 2028",
  assetClass: "fixed-income",
  bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12.5), maturityDate: "2028-01-02" },
} satisfies AssetToSave;

describe("registering a private bond", () => {
  it("creates it in Renda Fixa with its name as typed, its type, indexer, rate and maturity", () => {
    const state = applyOk(emptyPortfolio(), { type: "save-asset", asset: { ...CDB, ticker: "  CDB Inter 2028 " } });

    expect(state.assets).toEqual([{ id: 1, sourceId: null, ...CDB }]);
    expect(bond(state, "CDB Inter 2028")).toMatchObject({
      assetClass: "fixed-income",
      quantity: 0,
      currentValue: 0,
      bond: CDB.bond,
      tags: ["zero-position", "no-score"],
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
      tags: ["no-score"],
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
        tags: ["no-rate-index", "no-score"],
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

  it("refuses an application that would round to zero shares", () => {
    const state = applyOk(
      emptyPortfolio(),
      save({ ...CDB, bond: { ...CDB.bond!, rate: decimal(100) } }),
      apply10k(1, "2000-01-03"),
    );

    expect(apply(state, application(1, TODAY, 1), TODAY)).toEqual({
      ok: false,
      error: "O valor da aplicação de CDB Inter 2028 de 25/09/2026 é pequeno demais para representar as cotas com até 8 casas decimais.",
    });
  });

  it("refuses a rate correction that would round an existing application to zero shares", () => {
    const state = applyOk(registered, apply10k(1, "2000-01-03"), application(1, TODAY, 1));

    expect(apply(state, save({ ...CDB, id: 1, bond: { ...CDB.bond!, rate: decimal(100) } }), TODAY)).toEqual({
      ok: false,
      error: "O valor da aplicação de CDB Inter 2028 de 25/09/2026 é pequeno demais para representar as cotas com até 8 casas decimais.",
    });
  });
});

describe("private bond redemptions", () => {
  const invested = applyOk(emptyPortfolio(), save(CDB), apply10k(1, "2026-01-02"));
  const redeem = (date: IsoDate, amount: number, redeemsAll = false, id?: number): PortfolioCommand => ({
    type: "save-trade", trade: { id, asset: 1, kind: "sell", date, amount, ...(redeemsAll && { redeemsAll }) },
  });

  it("a partial redemption sells shares at the day's curve and realizes their gain", () => {
    const state = applyOk(invested, redeem(TODAY, 500_000));
    const view = bond(state, CDB.ticker);
    const sale = view.trades[0]!;
    expect(sale).toMatchObject({ kind: "sell", total: 500_000, unitPrice: decimal(1.08929742) });
    expect(sale.quantity).toBe(decimal(4590.114608));
    expect(sale.realizedGain).toBeCloseTo(40_988.5392, 5);
    expect(view.cost).toBeCloseTo(1_000_000 - 459_011.4608, 5);
    expect(view.totalGain).toBeCloseTo(89_297.42, 5);
  });

  it("refuses more than the value on the curve, naming that date and value", () => {
    expect(apply(invested, redeem(TODAY, 1_089_298), TODAY)).toEqual({
      ok: false, error: "Em 25/09/2026 o título valia só R$ 10.892,97 na curva.",
    });
  });

  it("a total redemption sells every remaining share for the amount actually received", () => {
    const state = applyOk(invested, redeem("2026-05-04", 500_000), redeem(TODAY, 600_000, true));
    const view = bond(state, CDB.ticker);
    expect(view).toMatchObject({ quantity: 0, cost: 0, averagePrice: null, currentValue: 0, totalGain: 100_000 });
    expect(view.trades[0]).toMatchObject({ redeemsAll: true, total: 600_000, unitPrice: decimal(1.08929742) });
    expect(view.trades[0]!.realizedGain! + view.trades[1]!.realizedGain!).toBeCloseTo(100_000, 6);
  });

  it("includes a total redemption below the curve in the sale result and total gain", () => {
    const state = applyOk(invested, redeem(TODAY, 950_000, true));
    expect(bond(state, CDB.ticker)).toMatchObject({ quantity: 0, cost: 0, totalGain: -50_000 });
    expect(bond(state, CDB.ticker).trades[0]).toMatchObject({ quantity: decimal(10_000), realizedGain: -50_000 });
  });

  it("rejects malformed total flags, total applications and total sales of other assets", () => {
    const total = { asset: 1, kind: "sell", date: TODAY, amount: 100, redeemsAll: true } as const;
    expect(apply(invested, { type: "save-trade", trade: { ...total, redeemsAll: "true" as never } }, TODAY)).toEqual({
      ok: false, error: "Informe se o resgate é total.",
    });
    expect(apply(invested, { type: "save-trade", trade: { ...total, kind: "buy" } }, TODAY)).toEqual({
      ok: false, error: "Só um resgate pode ser total.",
    });
    const stocks = applyOk(invested, save({ ticker: "PETR4", assetClass: "domestic-stocks" }));
    expect(apply(stocks, { type: "save-trade", trade: {
      asset: 2, kind: "sell", date: TODAY, quantity: decimal(1), unitPrice: decimal(1), redeemsAll: true,
    } as never }, TODAY)).toEqual({ ok: false, error: "Só o título privado tem resgate total." });
  });

  it("a total redemption with no position is refused, even before the first application", () => {
    expect(apply(invested, redeem("2025-12-31", 100, true), TODAY).ok).toBe(false);
    const state = applyOk(invested, redeem(TODAY, 1_100_000, true));
    expect(apply(state, redeem(TODAY, 100, true), TODAY).ok).toBe(false);
  });

  it("protects later redemptions when correcting or deleting applications or redemptions", () => {
    const state = applyOk(invested, redeem("2026-05-04", 500_000), redeem(TODAY, 500_000));
    const commands: PortfolioCommand[] = [
      { type: "delete-trade", id: 1 },
      { type: "save-trade", trade: { id: 1, asset: 1, kind: "buy", date: "2026-01-02", amount: 100_000 } },
      { type: "save-trade", trade: { id: 1, asset: 1, kind: "buy", date: TODAY, amount: 1_000_000 } },
      redeem("2026-05-04", 900_000, false, 2),
      redeem("2026-05-04", 500_000, true, 2),
      save({ ...CDB, id: 1, bond: { ...CDB.bond!, indexer: "cdi-percentage" } }),
    ];
    // The two sales fit at 12.5%, but not at a lower curve or without an index.
    const nearLimit = applyOk(invested, redeem(TODAY, 1_080_000));
    expect(apply(nearLimit, save({ ...CDB, id: 1, bond: { ...CDB.bond!, rate: decimal(1) } }), TODAY).ok).toBe(false);
    expect(apply(nearLimit, commands.at(-1)!, TODAY).ok).toBe(false);
    for (const command of commands.slice(0, -1)) expect(apply(state, command, TODAY).ok).toBe(false);
    expect(applyOk(state, { type: "delete-trade", id: 3 }).trades).toHaveLength(2);
  });

  it("replays total redemptions in date and entry order, and starts the cost again after reinvesting", () => {
    const state = applyOk(invested, application(1, TODAY, 200_000), redeem("2026-05-04", 1_030_000, true));
    expect(bond(state, CDB.ticker).cost).toBe(200_000);
    expect(bond(state, CDB.ticker).totalGain).toBeCloseTo(30_000, 6);
    const closed = applyOk(state, redeem(TODAY, 210_000, true));
    expect(bond(closed, CDB.ticker)).toMatchObject({ quantity: 0, totalGain: 40_000 });
  });
});

describe("bond maturity", () => {
  const maturityDate: IsoDate = "2026-05-04";
  const maturedBond: AssetToSave = { ...CDB, bond: { ...CDB.bond!, maturityDate } };
  const registered = applyOk(emptyPortfolio(), save(maturedBond));
  const invested = applyOk(registered, apply10k(1, "2026-01-02"));

  it("stops the curve at maturity without recording a redemption", () => {
    const atMaturity = bond(invested, CDB.ticker, maturityDate);
    expect(atMaturity.quote).toBeCloseTo(103.858461, 8); // 81 business days
    expect(bond(invested, CDB.ticker).quote).toBe(atMaturity.quote);
    expect(bond(invested, CDB.ticker, "2029-01-02").currentValue).toBe(atMaturity.currentValue);
    expect(atMaturity.quantity).toBe(decimal(10_000));
    expect(invested.trades).toHaveLength(1);
  });

  it("tags the bond from its maturity date, including a bond with no applications", () => {
    for (const state of [registered, invested]) {
      expect(bond(state, CDB.ticker, "2026-05-03").tags).not.toContain("matured");
      expect(bond(state, CDB.ticker, maturityDate).tags).toContain("matured");
      expect(bond(state, CDB.ticker).tags).toContain("matured");
    }
  });

  it("refuses applications on or after maturity, including corrections", () => {
    for (const date of [maturityDate, TODAY]) {
      const command = application(1, date, 100_000);
      expect(apply(invested, command, TODAY)).toEqual({
        ok: false, error: "Não é possível comprar ou aplicar no vencimento de 04/05/2026 ou depois dele.",
      });
      expect(apply(invested, { type: "save-trade", trade: { id: 1, asset: 1, kind: "buy", date, amount: 100_000 } }, TODAY).ok).toBe(false);
    }
    expect(apply(invested, application(1, "2026-05-03", 100_000), TODAY).ok).toBe(true);
  });

  it("accepts partial and total redemptions after maturity at the frozen curve", () => {
    const state = applyOk(invested,
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: "2026-06-01", amount: 500_000 } },
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: TODAY, amount: 550_000, redeemsAll: true } },
    );
    const view = bond(state, CDB.ticker);
    expect(view).toMatchObject({ quantity: 0, currentValue: 0, cost: 0, totalGain: 50_000 });
    expect(view.tags).toEqual(expect.arrayContaining(["matured", "zero-position"]));
    expect(view.trades).toHaveLength(3);
    expect(view.trades.slice(0, 2).map((t) => t.unitPrice)).toEqual([decimal(1.03858461), decimal(1.03858461)]);
    expect(projectPortfolio(state, TODAY).totalGain).toBeCloseTo(50_000, 6);
  });

  it("refuses a maturity correction on or before any application, even after total redemption", () => {
    const state = applyOk(invested, application(1, "2026-04-01", 100_000),
      { type: "save-trade", trade: { asset: 1, kind: "sell", date: TODAY, amount: 1_200_000, redeemsAll: true } },
    );
    for (const date of ["2026-03-31", "2026-04-01"] as IsoDate[]) {
      expect(apply(state, save({ ...maturedBond, id: 1, bond: { ...maturedBond.bond!, maturityDate: date } }), TODAY)).toEqual({
        ok: false, error: "O vencimento precisa ser depois de todas as compras ou aplicações do título.",
      });
    }
    expect(apply(state, save({ ...maturedBond, id: 1, bond: { ...maturedBond.bond!, maturityDate: "2026-04-02" } }), TODAY).ok).toBe(true);
  });

  it("never tags a matured bond with a stale quote, even with a stored old quote", () => {
    const state = { ...invested, quotes: [{ asset: 1, price: decimal(1), at: "2026-01-02T12:00:00Z" as const }] };
    expect(bond(state, CDB.ticker).tags).toContain("matured");
    expect(bond(state, CDB.ticker).tags).not.toContain("stale-quote");
    expect(projectPortfolio(state, TODAY).staleQuote).toBe(false);
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
