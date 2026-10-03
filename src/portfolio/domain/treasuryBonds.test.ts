import { describe, expect, it } from "vitest";
import {
  apply, decimal, emptyPortfolio, projectPortfolio,
  type AssetToSave, type IsoDate, type PortfolioCommand, type PortfolioState,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";
const TREASURY = {
  ticker: "Tesouro IPCA+ 2035", assetClass: "fixed-income", sourceId: "ipca-plus|2035-05-15",
  bond: { kind: "treasury-bond", maturityDate: "2035-05-15" },
} satisfies AssetToSave;
const register = (asset: AssetToSave = TREASURY): PortfolioCommand => ({ type: "save-asset", asset });
const trade = (kind: "buy" | "sell", date: IsoDate, quantity: number, unitPrice: number, id?: number): PortfolioCommand => ({
  type: "save-trade", trade: { id, asset: 1, kind, date, quantity: decimal(quantity), unitPrice: decimal(unitPrice) },
});
const quote = (price: number): PortfolioCommand => ({
  type: "record-quotes", quotes: [{ asset: 1, price: decimal(price), at: "2026-09-25T12:00:00" }],
});
function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  for (const command of commands) {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}
const assetView = (state: PortfolioState, today: IsoDate = TODAY) =>
  projectPortfolio(state, today).classes.find((c) => c.key === "fixed-income")!.assets[0]!;

describe("Treasury bonds in the portfolio", () => {
  it("registers the list's name, maturity and source identifier before the first buy", () => {
    const state = run(emptyPortfolio(), register({ ...TREASURY, ticker: `  ${TREASURY.ticker}  ` }));
    expect(state.assets).toEqual([{ id: 1, ...TREASURY }]);
    expect(assetView(state)).toMatchObject({
      ticker: "Tesouro IPCA+ 2035", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" },
      currency: "BRL", quantity: 0, currentValue: 0, tags: ["no-quote", "zero-position"],
    });
    expect(apply(run(state, register({ ticker: "PETR4", assetClass: "domestic-stocks" })),
      register({ ...TREASURY, ticker: "tesouro ipca+ 2035" }), TODAY)).toEqual({
      ok: false, error: "Já existe um ativo tesouro ipca+ 2035 na carteira.",
    });
  });

  it("refuses a missing source identifier, invalid maturity, or changes to the class or bond kind", () => {
    expect(apply(emptyPortfolio(), register({ ...TREASURY, sourceId: null }), TODAY)).toEqual({
      ok: false, error: "Escolha um título do Tesouro Direto na lista.",
    });
    expect(apply(emptyPortfolio(), register({ ...TREASURY, bond: { ...TREASURY.bond, maturityDate: "2035-02-30" } }), TODAY)).toEqual({
      ok: false, error: "Informe um vencimento válido.",
    });
    const state = run(emptyPortfolio(), register());
    expect(apply(state, register({ ...TREASURY, id: 1, assetClass: "domestic-stocks" }), TODAY)).toEqual({
      ok: false, error: "A classe de um ativo não muda depois do cadastro.",
    });
    expect(apply(state, register({ ...TREASURY, id: 1, bond: {
      kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(10), maturityDate: "2035-05-15",
    } }), TODAY)).toEqual({ ok: false, error: "O jeito do título não muda depois do cadastro." });
  });

  it("values fractional buys and sales at market with the same average-cost rules as stocks", () => {
    // R$ 740 + R$ 390 buys 0.5 titles: R$ 2,260 per title.
    // Selling 0.2 for R$ 480 realizes R$ 28; 0.3 at R$ 2,500 gains R$ 72.
    const state = run(emptyPortfolio(), register(),
      trade("buy", "2026-01-02", 0.37, 2000), trade("buy", "2026-02-02", 0.13, 3000),
      trade("sell", "2026-03-02", 0.2, 2400), quote(2500));
    const view = assetView(state);
    expect(view.quantity).toBe(decimal(0.3));
    expect(view.averagePrice).toBeCloseTo(226_000, 6);
    expect(view.cost).toBeCloseTo(67_800, 6);
    expect(view.quote).toBe(250_000);
    expect(view.currentValue).toBe(75_000);
    expect(view.unrealizedGain).toBeCloseTo(7_200, 6);
    expect(view.realizedGain).toBeCloseTo(2_800, 6);
    expect(view.totalGain).toBeCloseTo(10_000, 6);
    expect(view.trades[0]).toMatchObject({ kind: "sell", total: 48_000 });
    expect(view.trades[0]!.realizedGain).toBeCloseTo(2_800, 6);
  });

  it("keeps the cost and a no-quote tag until the first market quote arrives", () => {
    const state = run(emptyPortfolio(), register(), trade("buy", "2026-01-02", 0.37, 2000));
    expect(assetView(state)).toMatchObject({ quote: null, quoteAt: null, cost: 74_000, currentValue: 74_000, totalGain: 0, tags: ["no-quote"] });
  });

  it("includes manual interest in total gain before and after selling every title", () => {
    const state = run(emptyPortfolio(), register(), trade("buy", "2026-01-02", 0.37, 2000), quote(2500),
      { type: "save-payout", payout: { asset: 1, date: "2026-05-15", kind: "interest", amount: 1_234 } });
    expect(assetView(state).payouts).toEqual([{ id: 1, date: "2026-05-15", kind: "interest", amount: 1_234 }]);
    expect(assetView(state).totalGain).toBeCloseTo(19_734, 6);
    expect(projectPortfolio(state, TODAY).payoutsReceived).toBe(1_234);
    const sold = run(state, trade("sell", TODAY, 0.37, 2200));
    expect(assetView(sold)).toMatchObject({ quantity: 0, cost: 0, currentValue: 0, payoutsReceived: 1_234, tags: ["zero-position"] });
    expect(assetView(sold).realizedGain).toBeCloseTo(7_400, 6);
    expect(projectPortfolio(sold, TODAY).totalGain).toBeCloseTo(8_634, 6);
  });

  it("protects sales against uncovered buys, corrections and deletions, and refuses private-bond trade fields", () => {
    const state = run(emptyPortfolio(), register(), trade("buy", "2026-01-02", 0.37, 2000), trade("sell", "2026-02-02", 0.2, 2200));
    for (const command of [trade("sell", TODAY, 0.18, 2200), trade("sell", "2026-01-01", 0.1, 2200),
      trade("buy", "2026-01-02", 0.1, 2000, 1), { type: "delete-trade", id: 1 } satisfies PortfolioCommand]) {
      expect(apply(state, command, TODAY).ok).toBe(false);
    }
    expect(apply(state, { type: "save-trade", trade: { asset: 1, kind: "buy", date: TODAY, amount: 100 } }, TODAY)).toEqual({
      ok: false, error: "Só o título privado recebe o valor em reais.",
    });
  });

  it("adds market value and gain to fixed income, its portfolio share and distance from the target", () => {
    const state = run(emptyPortfolio(), register(), trade("buy", "2026-01-02", 0.5, 2000), quote(2400),
      register({ ticker: "PETR4", assetClass: "domestic-stocks" }),
      { type: "save-trade", trade: { asset: 2, kind: "buy", date: "2026-01-02", quantity: decimal(80), unitPrice: decimal(10) } });
    const view = projectPortfolio(state, TODAY);
    expect(view).toMatchObject({ cost: 180_000, currentValue: 200_000, totalGain: 20_000 });
    expect(view.classes.find((c) => c.key === "fixed-income")).toMatchObject({
      value: 120_000, totalGain: 20_000, share: 60, target: 45, toTarget: -30_000,
    });
  });
});

describe("Treasury bond maturity", () => {
  const maturityDate: IsoDate = "2026-09-01";
  const maturedAsset = { ...TREASURY, ticker: "Tesouro IPCA+ 2026", sourceId: "ipca-plus|2026-09-01", bond: { ...TREASURY.bond, maturityDate } };
  const registered = run(emptyPortfolio(), register(maturedAsset));
  const invested = run(registered, trade("buy", "2026-01-02", 0.5, 2000), {
    type: "record-quotes", quotes: [{ asset: 1, price: decimal(2200), at: "2026-08-03T12:00:00" }],
  });

  it("tags maturity on its date with or without a position, keeps the last quote and suppresses stale-quote", () => {
    expect(assetView(invested, "2026-08-31").tags).toContain("stale-quote");
    expect(assetView(invested, "2026-08-31").tags).not.toContain("matured");
    for (const state of [registered, invested]) {
      expect(assetView(state, maturityDate).tags).toContain("matured");
      expect(assetView(state).tags).not.toContain("stale-quote");
    }
    for (const date of [maturityDate, TODAY, "2030-01-02"] as IsoDate[]) {
      expect(assetView(invested, date)).toMatchObject({ quantity: decimal(0.5), quote: 220_000,
        quoteAt: "2026-08-03T12:00:00", currentValue: 110_000, totalGain: 10_000, tags: ["matured"] });
      expect(projectPortfolio(invested, date).staleQuote).toBe(false);
    }
    expect(invested.trades).toHaveLength(1);
  });

  it("refuses buys and buy corrections on or after maturity but accepts the preceding day", () => {
    for (const date of [maturityDate, TODAY]) {
      for (const id of [undefined, 1]) {
        expect(apply(invested, trade("buy", date, 0.1, 2000, id), TODAY)).toEqual({
          ok: false, error: "Não é possível comprar ou aplicar no vencimento de 01/09/2026 ou depois dele.",
        });
      }
    }
    expect(apply(invested, trade("buy", "2026-08-31", 0.1, 2000), TODAY).ok).toBe(true);
  });

  it("accepts partial and full sales after maturity and keeps maturity and lifetime gain at zero position", () => {
    const partial = run(invested, trade("sell", "2026-09-02", 0.2, 2400));
    expect(assetView(partial).quantity).toBe(decimal(0.3));
    expect(assetView(partial).totalGain).toBeCloseTo(14_000, 6);
    const sold = run(partial, trade("sell", TODAY, 0.3, 2300));
    expect(assetView(sold)).toMatchObject({ quantity: 0, cost: 0, currentValue: 0, tags: ["matured", "zero-position"] });
    expect(assetView(sold).totalGain).toBeCloseTo(17_000, 6);
    expect(assetView(sold).trades.map((t) => t.date)).toEqual([TODAY, "2026-09-02", "2026-01-02"]);
  });

  it("refuses a maturity correction that would invalidate a recorded buy", () => {
    expect(apply(invested, register({ ...maturedAsset, id: 1, bond: { ...maturedAsset.bond, maturityDate: "2026-01-02" } }), TODAY)).toEqual({
      ok: false, error: "O vencimento precisa ser depois de todas as compras ou aplicações do título.",
    });
  });
});
