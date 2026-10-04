import { describe, expect, it } from "vitest";
import { apply, decimal, emptyPortfolio, projectPortfolio, type AssetToSave, type IsoDate, type PortfolioCommand, type PortfolioState } from "@/portfolio/domain";

const TODAY = "2026-09-25";
function run(state: PortfolioState, command: PortfolioCommand, today: IsoDate = TODAY): PortfolioState {
  const result = apply(state, command, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const created = () => run(emptyPortfolio(), { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto" } });
const assetView = (state: PortfolioState) => projectPortfolio(state, TODAY).classes.find(c => c.key === "crypto")!.assets[0]!;

describe("manual scores through the portfolio", () => {
  it("distinguishes an unevaluated asset from zero and replaces the current score and evaluation date", () => {
    const state = created();
    expect(assetView(state)).toMatchObject({ score: null, evaluatedAt: null, tags: expect.arrayContaining(["no-score"]) });
    const zero = run(state, { type: "save-score", asset: 1, score: 0 });
    expect(assetView(zero)).toMatchObject({ score: 0, evaluatedAt: TODAY, quantity: 0, tags: expect.arrayContaining(["non-positive-score"]) });
    expect(assetView(zero).tags).not.toContain("no-score");
    const corrected = run(zero, { type: "save-score", asset: 1, score: 10 }, "2026-09-26");
    expect(assetView(corrected)).toMatchObject({ score: 10, evaluatedAt: "2026-09-26" });
    expect(corrected.scores).toHaveLength(1);
    expect(state).toEqual(created());
    expect(run(corrected, { type: "save-score", asset: 1, score: 10 }, "2026-09-27").scores[0]?.evaluatedAt).toBe("2026-09-27");
  });
  it.each([1.5, -1, 11, NaN, Infinity, -Infinity])("refuses an invalid score %s without changing the portfolio", (score) => {
    const state = created();
    expect(apply(state, { type: "save-score", asset: 1, score }, TODAY)).toEqual({ ok: false, error: "Informe uma nota inteira de 0 a 10." });
    expect(assetView(state).score).toBeNull();
  });

  it.each(["domestic-stocks", "international-stocks", "real-estate-funds"] as const)("refuses a typed score for %s", (assetClass) => {
    const state = run(emptyPortfolio(), { type: "save-asset", asset: { ticker: "TEST", assetClass } });
    expect(apply(state, { type: "save-score", asset: 1, score: 10 }, TODAY)).toEqual({ ok: false, error: "Essa classe usa questionário e não aceita nota digitada." });
    expect(projectPortfolio(state, TODAY).classes.find(c => c.key === assetClass)!.assets[0]).toMatchObject({ score: null, evaluatedAt: null });
  });

  it("keeps the position, value and lifetime gain when a held asset receives zero", () => {
    let state = created();
    state = run(state, { type: "save-trade", trade: { asset: 1, kind: "buy", date: TODAY, quantity: decimal(2), unitPrice: decimal(100) } });
    state = run(state, { type: "record-quotes", quotes: [{ asset: 1, price: decimal(120), at: "2026-09-25T12:00:00" }], exchangeRate: { rate: 50000, at: "2026-09-25T12:00:00" } });
    const zero = run(state, { type: "save-score", asset: 1, score: 0 });
    expect(assetView(zero)).toMatchObject({ score: 0, quantity: decimal(2), currentValue: 24000, totalGain: 4000 });
    expect(projectPortfolio(zero, TODAY)).toMatchObject({ currentValue: 24000, totalGain: 4000 });
    expect(apply(zero, { type: "delete-asset", id: 1 }, TODAY)).toEqual({ ok: false, error: "BTC tem operações: um ativo com histórico fica na carteira para sempre." });
  });

  it("keeps the existing deletion restriction for an evaluated bond with payouts", () => {
    let state = run(emptyPortfolio(), { type: "save-asset", asset: { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12), maturityDate: "2028-01-03" } } });
    state = run(state, { type: "save-payout", payout: { asset: 1, date: TODAY, kind: "interest", amount: 1000 } });
    state = run(state, { type: "save-score", asset: 1, score: 10 });
    expect(apply(state, { type: "delete-asset", id: 1 }, TODAY)).toEqual({ ok: false, error: "CDB tem proventos: um ativo com histórico fica na carteira para sempre." });
  });

  it("removes the evaluation when an unused asset is deleted", () => {
    const state = run(created(), { type: "save-score", asset: 1, score: 10 });
    const deleted = run(state, { type: "delete-asset", id: 1 });
    expect(deleted.scores).toEqual([]);
    expect(projectPortfolio(deleted, TODAY).classes.find(c => c.key === "crypto")!.assets).toEqual([]);
  });

  it("refuses an evaluation for an absent asset", () => {
    expect(apply(emptyPortfolio(), { type: "save-score", asset: 99, score: 10 }, TODAY)).toEqual({ ok: false, error: "Esse ativo não existe." });
  });

  it.each<AssetToSave>([
    { ticker: "Tesouro 2035", assetClass: "fixed-income", sourceId: "treasury-2035", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } },
    { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: 1200000000, maturityDate: "2028-01-03" } },
  ])("evaluates a fixed-income asset before the first buy: $ticker", (asset) => {
    const state = run(emptyPortfolio(), { type: "save-asset", asset });
    const evaluated = run(state, { type: "save-score", asset: 1, score: 10 });
    expect(projectPortfolio(evaluated, TODAY).classes.find(c => c.key === "fixed-income")!.assets[0]).toMatchObject({ score: 10, quantity: 0, evaluatedAt: TODAY });
  });
});
