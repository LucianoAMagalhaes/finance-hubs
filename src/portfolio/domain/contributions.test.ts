import { describe, expect, it } from "vitest";
import { apply, decimal, emptyPortfolio, projectPortfolio, suggestContribution, type AssetToSave, type ContributionSuggestion, type IsoDate, type PortfolioCommand, type PortfolioState, type Targets } from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";
function run(state: PortfolioState, command: PortfolioCommand, today: IsoDate = TODAY): PortfolioState {
  const result = apply(state, command, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function suggest(state: PortfolioState, amount = 10000, today = TODAY): ContributionSuggestion {
  const result = suggestContribution(state, amount, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const targets = (crypto = 100, fixedIncome = 0, international = 0): Targets => ({
  crypto, "fixed-income": fixedIncome, "international-stocks": international, "domestic-stocks": 0, "real-estate-funds": 0,
});
function add(state: PortfolioState, asset: AssetToSave, score = 10, price = 1, quantity = 0): PortfolioState {
  state = run(state, { type: "save-asset", asset });
  const id = state.assets.at(-1)!.id;
  if (asset.assetClass === "crypto" || asset.assetClass === "fixed-income") {
    state = run(state, { type: "save-score", asset: id, score });
  } else {
    const questionnaire = state.questionnaires.find(q => q.id === (asset.assetClass === "real-estate-funds" ? "real-estate-funds" : "stocks"))!;
    for (const question of questionnaire.questions) state = run(state, { type: "save-answer", asset: id, question: question.id, value: true });
  }
  if (quantity > 0) state = run(state, { type: "save-trade", trade: { asset: id, date: TODAY, kind: "buy", quantity: decimal(quantity), unitPrice: decimal(price), ...(asset.assetClass === "international-stocks" && { exchangeRate: 50000 }) } });
  return run(state, { type: "record-quotes", quotes: [{ asset: id, price: decimal(price), at: `${TODAY}T12:00:00` }] });
}

describe("contribution suggestions through the portfolio", () => {
  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])("refuses an invalid contribution in cents: %s", amount => {
    expect(suggestContribution(emptyPortfolio(), amount, TODAY)).toEqual({ ok: false, error: "Informe um aporte em reais com centavos, maior que zero e dentro do valor suportado." });
  });
  it("leaves one cent without a destination in an empty portfolio and does not change state", () => {
    const state = emptyPortfolio();
    const before = structuredClone(state);
    const result = suggestContribution(state, 1, "2026-09-25");
    expect(result).toMatchObject({ ok: true, value: { contribution: 1, distributed: 0, unallocated: 1 } });
    expect(state).toEqual(before);
  });
  it("distributes distinct class shortfalls without passing their ideal values", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(50, 50) });
    state = add(state, { ticker: "BTC", assetClass: "crypto" }, 10, 1, 80);
    state = add(state, { ticker: "Tesouro", assetClass: "fixed-income", sourceId: "treasury", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } }, 10, 1, 20);
    // R$ 100 held + R$ 100 contributed: each target is R$ 100, shortfalls R$ 20 and R$ 80.
    const result = suggest(state);
    expect(result.classes.find(c => c.key === "crypto")).toMatchObject({ currentValue: 8000, shortfall: 2000, amount: 2000, assets: [{ amount: 2000 }] });
    expect(result.classes.find(c => c.key === "fixed-income")).toMatchObject({ currentValue: 2000, shortfall: 8000, amount: 8000, assets: [{ amount: 8000 }] });
    expect(result).toMatchObject({ distributed: 10000, unallocated: 0 });
  });
  it("uses only eligible values inside the class and gives nothing to an asset above its ideal", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets() });
    state = add(state, { ticker: "HIGH", assetClass: "crypto" }, 9, 1, 100);
    state = add(state, { ticker: "LOW", assetClass: "crypto" }, 1, 1, 0);
    state = add(state, { ticker: "EXCLUDED", assetClass: "crypto" }, 0, 1, 900);
    const c = suggest(state, 1000).classes.find(c => c.key === "crypto")!;
    // R$ 1,010 total after contribution; class shortfall R$ 10. Eligible total R$ 110.
    // HIGH's ideal is R$ 99 < R$ 100 held. LOW's ideal and shortfall are R$ 11.
    expect(c).toMatchObject({ currentValue: 100000, shortfall: 1000, amount: 1000 });
    expect(c.assets.find(a => a.ticker === "HIGH")).toMatchObject({ idealWeight: 0.9, shortfall: 0, amount: 0 });
    expect(c.assets.find(a => a.ticker === "LOW")).toMatchObject({ idealWeight: 0.1, shortfall: 1100, amount: 1000 });
    expect(c.assets.find(a => a.ticker === "EXCLUDED")).toMatchObject({ idealWeight: null, amount: 0, exclusions: ["non-positive-score"] });
  });
  it("accepts five business days across an ANBIMA holiday and excludes on the sixth even with zero position", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 0, 100) });
    state = add(state, { ticker: "AAPL", assetClass: "international-stocks" });
    state = run(state, { type: "record-quotes", quotes: [{ asset: 1, price: decimal(10), at: "2026-09-04T12:00:00" }], exchangeRate: { rate: 50000, at: "2026-09-04T12:00:00" } });
    // September 7 is a holiday; September 8, 9, 10, 11, 14 are five business days.
    expect(suggest(state, 1, "2026-09-14")).toMatchObject({ distributed: 1, unallocated: 0 });
    const old = suggest(state, 10000, "2026-09-15");
    expect(old).toMatchObject({ distributed: 0, unallocated: 10000 });
    expect(old.classes.find(c => c.key === "international-stocks")!.assets[0]!.exclusions).toEqual(["stale-quote", "stale-exchange-rate"]);
  });
  it("offers a first private application at R$ 1 without an external quote or a prior position", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 100) });
    state = run(state, { type: "save-asset", asset: { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12), maturityDate: "2028-01-03" } } });
    state = run(state, { type: "save-score", asset: 1, score: 10 });
    expect(suggest(state, 1).classes.find(c => c.key === "fixed-income")!.assets[0]).toMatchObject({ price: 100, quantity: null, bondKind: "private-bond", amount: 1, exclusions: [] });
  });
  it.each(["cdi-percentage", "ipca-plus"] as const)("requires the necessary index before a first %s application", indexer => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 100) });
    state = run(state, { type: "save-asset", asset: { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer, rate: decimal(indexer === "cdi-percentage" ? 100 : 6), maturityDate: "2028-01-03" } } });
    state = run(state, { type: "save-score", asset: 1, score: 10 });
    expect(suggest(state).classes.find(c => c.key === "fixed-income")!.assets[0]).toMatchObject({ price: null, amount: 0, exclusions: ["no-rate-index"] });
    state = run(state, { type: "record-rate-indexes", rateIndexes: [{ kind: indexer === "cdi-percentage" ? "cdi" : "ipca", date: indexer === "cdi-percentage" ? TODAY : "2026-09-01", rate: decimal(0.05) }] });
    expect(suggest(state).classes.find(c => c.key === "fixed-income")!.assets[0]).toMatchObject({ price: 100, amount: 10000, exclusions: [] });
  });
  it("values dollars with the current rate and reports the rate and price used", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(50, 0, 50) });
    state = add(state, { ticker: "BTC", assetClass: "crypto" }, 10, 1, 50);
    state = add(state, { ticker: "AAPL", assetClass: "international-stocks" }, 10, 10, 1);
    state = run(state, { type: "record-quotes", quotes: [], exchangeRate: { rate: 100000, at: `${TODAY}T12:00:00` } });
    // Current values R$ 50 and R$ 100, not the R$ 50 paid for the dollar asset.
    // R$ 250 after contributing: ideals R$ 125, shortfalls R$ 75 and R$ 25.
    const result = suggest(state);
    expect(result.classes.find(c => c.key === "crypto")).toMatchObject({ amount: 7500 });
    expect(result.classes.find(c => c.key === "international-stocks")!.assets[0]).toMatchObject({ currentValue: 10000, price: 1000, exchangeRate: 100000, amount: 2500 });
  });
  it("keeps monetary rows coherent in cents and conserves the contribution", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets() });
    for (const ticker of ["AAA", "BBB", "CCC"]) state = add(state, { ticker, assetClass: "crypto" }, 1);
    const result = suggest(state, 100);
    expect(result.classes.find(c => c.key === "crypto")!.assets.map(a => a.amount)).toEqual([34, 33, 33]);
    expect(result).toMatchObject({ distributed: 100, unallocated: 0 });
  });
  it("closes eligible class shortfalls and leaves the rest without redirecting it", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(50, 50) });
    state = add(state, { ticker: "BTC", assetClass: "crypto" });
    const result = suggest(state);
    expect(result.classes.find(c => c.key === "crypto")).toMatchObject({ amount: 5000, shortfall: 5000 });
    expect(result.classes.find(c => c.key === "fixed-income")).toMatchObject({ name: "Renda Fixa", amount: 0, target: 50, assets: [] });
    expect(result).toMatchObject({ distributed: 5000, unallocated: 5000 });
  });
  it("gives nothing to a zero target or a class already above its target after the contribution", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 100) });
    state = add(state, { ticker: "BTC", assetClass: "crypto" });
    expect(suggest(state)).toMatchObject({ distributed: 0, unallocated: 10000 });
    state = run(state, { type: "save-targets", targets: targets(50, 50) });
    state = run(state, { type: "save-trade", trade: { asset: 1, date: TODAY, kind: "buy", quantity: decimal(1000), unitPrice: decimal(1) } });
    expect(suggest(state).classes.find(c => c.key === "crypto")).toMatchObject({ shortfall: 0, amount: 0 });
  });
  it("refuses missing quote and exchange rate as prices even when the dashboard uses cost", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 0, 100) });
    state = run(state, { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } });
    for (const q of state.questionnaires.find(q => q.id === "stocks")!.questions) state = run(state, { type: "save-answer", asset: 1, question: q.id, value: true });
    state = run(state, { type: "save-trade", trade: { asset: 1, date: TODAY, kind: "buy", quantity: decimal(2), unitPrice: decimal(10), exchangeRate: 50000 } });
    const result = suggest(state);
    expect(result).toMatchObject({ distributed: 0, unallocated: 10000 });
    expect(result.classes.find(c => c.key === "international-stocks")!.assets[0]).toMatchObject({ currentValue: 10000, price: null, exclusions: ["no-quote", "no-exchange-rate"] });
    state = run(state, { type: "record-quotes", quotes: [{ asset: 1, price: decimal(20), at: `${TODAY}T12:00:00` }] });
    expect(suggest(state).classes.find(c => c.key === "international-stocks")!.assets[0]).toMatchObject({ currentValue: 10000, amount: 0, exclusions: ["no-exchange-rate"] });
  });
  it("keeps assets without a score or with a negative questionnaire score out of the recipients", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
    state = run(state, { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } });
    state = run(state, { type: "record-quotes", quotes: [{ asset: 1, price: decimal(10), at: `${TODAY}T12:00:00` }] });
    expect(suggest(state).classes[0]!.assets[0]).toMatchObject({ amount: 0, exclusions: ["no-score"] });
    for (const q of state.questionnaires.find(q => q.id === "stocks")!.questions) state = run(state, { type: "save-answer", asset: 1, question: q.id, value: false });
    expect(suggest(state).classes[0]!.assets[0]).toMatchObject({ score: -11, amount: 0, exclusions: ["non-positive-score"] });
  });
  it("excludes a pending corporate action until the person decides it", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
    state = add(state, { ticker: "PETR4", assetClass: "domestic-stocks" }, 10, 10, 1);
    state = run(state, { type: "record-source-corporate-actions", actions: [{ asset: 1, kind: "split", date: "2026-09-26", ratio: { from: 1, to: 2 } }] }, "2026-09-26");
    expect(suggest(state, 10000, "2026-09-26").classes[0]!.assets[0]).toMatchObject({ currentValue: 1000, amount: 0, exclusions: ["pending-corporate-action"] });
    state = run(state, { type: "dismiss-corporate-action", id: 1 }, "2026-09-26");
    expect(suggest(state, 10000, "2026-09-26")).toMatchObject({ distributed: 10000, unallocated: 0 });
  });
  it("excludes a bond on its maturity date while retaining its value in the class", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 100) });
    state = add(state, { ticker: "Tesouro", assetClass: "fixed-income", sourceId: "treasury", bond: { kind: "treasury-bond", maturityDate: "2026-09-26" } }, 10, 100, 1);
    expect(suggest(state)).toMatchObject({ distributed: 10000, unallocated: 0 });
    expect(suggest(state, 10000, "2026-09-26").classes.find(c => c.key === "fixed-income")!.assets[0]).toMatchObject({ currentValue: 10000, amount: 0, exclusions: ["matured"] });
  });
  it("uses the accrued curve rather than an external quote for a held private bond", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 100) });
    state = run(state, { type: "save-asset", asset: { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12), maturityDate: "2028-01-03" } } });
    state = run(state, { type: "save-score", asset: 1, score: 10 });
    state = run(state, { type: "save-trade", trade: { asset: 1, date: "2026-09-24", kind: "buy", amount: 10000 } });
    // One business day at 12% a year: a share worth R$ 1.00044982 (rounded to 8 places).
    const result = suggest(state);
    expect(result.classes.find(c => c.key === "fixed-income")!.assets[0]).toMatchObject({ price: 100.044982, amount: 10000, exclusions: [] });
    expect(result).toMatchObject({ distributed: 10000, unallocated: 0 });
  });
  it("recalculates with changed scores, targets, holdings, quotes and rate without changing state", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets() });
    state = add(state, { ticker: "AAA", assetClass: "crypto" }, 1);
    state = add(state, { ticker: "BBB", assetClass: "crypto" }, 1);
    const first = suggest(state);
    expect(first.classes.find(c => c.key === "crypto")!.assets.map(a => a.amount)).toEqual([5000, 5000]);
    state = run(state, { type: "save-score", asset: 1, score: 3 });
    expect(suggest(state).classes.find(c => c.key === "crypto")!.assets.map(a => a.amount)).toEqual([7500, 2500]);
    state = run(state, { type: "save-trade", trade: { asset: 1, date: TODAY, kind: "buy", quantity: decimal(100), unitPrice: decimal(1) } });
    state = run(state, { type: "record-quotes", quotes: [{ asset: 1, price: decimal(2), at: `${TODAY}T12:00:00` }] });
    expect(suggest(state).classes.find(c => c.key === "crypto")!.assets.map(a => a.amount)).toEqual([2500, 7500]);
    state = run(state, { type: "save-targets", targets: targets(50, 50) });
    const before = structuredClone(state);
    const projected = projectPortfolio(state, TODAY);
    expect(suggest(state)).toMatchObject({ distributed: 0, unallocated: 10000 });
    expect(state).toEqual(before);
    expect(projectPortfolio(state, TODAY)).toEqual(projected);
    expect(first.classes.find(c => c.key === "crypto")!.assets.map(a => a.amount)).toEqual([5000, 5000]);
  });
  it("divides a contribution proportionally when eligible shortfalls exceed the contribution", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(45, 45), "domestic-stocks": 10 } });
    state = add(state, { ticker: "PETR4", assetClass: "domestic-stocks" }, 10, 1, 80);
    state = add(state, { ticker: "BTC", assetClass: "crypto" }, 10, 1, 20);
    state = add(state, { ticker: "Tesouro", assetClass: "fixed-income", sourceId: "treasury", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } });
    // R$ 200 after contribution. Crypto lacks R$ 70 and fixed income R$ 90: 7/16 and 9/16.
    const result = suggest(state);
    expect(result.classes.find(c => c.key === "crypto")).toMatchObject({ shortfall: 7000, amount: 4375 });
    expect(result.classes.find(c => c.key === "fixed-income")).toMatchObject({ shortfall: 9000, amount: 5625 });
    expect(result.classes[0]).toMatchObject({ shortfall: 0, amount: 0 });
  });
  it("excludes an old exchange rate even with a fresh quote and exposes it on the dashboard row", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 0, 100) });
    state = add(state, { ticker: "AAPL", assetClass: "international-stocks" });
    state = run(state, { type: "record-quotes", quotes: [], exchangeRate: { rate: 50000, at: "2026-09-16T12:00:00" } });
    expect(suggest(state).classes.find(c => c.key === "international-stocks")!.assets[0]).toMatchObject({ amount: 0, exclusions: ["stale-exchange-rate"] });
    expect(projectPortfolio(state, TODAY).classes.find(c => c.key === "international-stocks")!.assets[0]!.tags).toContain("stale-exchange-rate");
  });
  it("never uses cost in place of an unavailable accrued price for a held private bond", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 100) });
    state = run(state, { type: "save-asset", asset: { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "cdi-percentage", rate: decimal(100), maturityDate: "2028-01-03" } } });
    state = run(state, { type: "save-score", asset: 1, score: 10 });
    state = run(state, { type: "save-trade", trade: { asset: 1, date: TODAY, kind: "buy", amount: 10000 } });
    expect(suggest(state).classes.find(c => c.key === "fixed-income")!.assets[0]).toMatchObject({ currentValue: 10000, price: null, amount: 0, exclusions: ["no-rate-index"] });
  });
  it.each([1, 2, 3, 99, 10001, 100000000])("returns finite nonnegative values and conserves %s cents across classes and assets", amount => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(33, 67) });
    for (const [ticker, score] of [["AAA", 2], ["BBB", 3], ["CCC", 7]] as const) state = add(state, { ticker, assetClass: "crypto" }, score);
    state = add(state, { ticker: "Tesouro", assetClass: "fixed-income", sourceId: "treasury", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } });
    const result = suggest(state, amount);
    const distributed = result.classes.reduce((sum, c) => sum + c.assets.reduce((sum, a) => sum + a.amount, 0), 0);
    expect(distributed + result.unallocated).toBe(amount);
    expect(distributed).toBe(result.distributed);
    for (const c of result.classes) {
      expect(c.assets.reduce((sum, a) => sum + a.amount, 0)).toBe(c.amount);
      expect(c.amount).toBeLessThanOrEqual(c.shortfall);
      for (const value of [c.shortfall, c.amount, result.unallocated, ...c.assets.flatMap(a => [a.amount, a.shortfall])]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});


describe("buyable contribution units", () => {
  it.each(["domestic-stocks", "real-estate-funds"] as const)("rounds %s down and keeps the remainder in its class", assetClass => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), [assetClass]: 100 } });
    state = add(state, { ticker: "AAA", assetClass }, 10, 30);
    const result = suggest(state, 10000);
    expect(result.classes.find(c => c.key === assetClass)).toMatchObject({ amount: 9000, unallocated: 1000, assets: [{ quantity: decimal(3), amount: 9000 }] });
    expect(result).toMatchObject({ distributed: 9000, unallocated: 1000 });
  });
});


describe("additional steps and fractional allocations", () => {
  it("repeatedly chooses the greatest remaining shortfall whose step fits, with stable ties", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
    for (const [ticker, price] of [["EXPENSIVE", 90], ["SMALL", 7], ["OTHER", 7]] as const) state = add(state, { ticker, assetClass: "domestic-stocks" }, 10, price);
    const result = suggest(state, 9000);
    expect(result.classes[0]).toMatchObject({ amount: 8400, unallocated: 600 });
    expect(result.classes[0]!.assets.map(a => [a.quantity, a.amount])).toEqual([[0, 0], [decimal(6), 4200], [decimal(6), 4200]]);
    expect(result).toMatchObject({ distributed: 8400, unallocated: 600 });
  });
  it("can cross an ideal by less than one step when buying the greatest shortfall", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
    for (const [ticker, price] of [["AAA", 60], ["BBB", 20], ["CCC", 20]] as const) state = add(state, { ticker, assetClass: "domestic-stocks" }, 10, price);
    expect(suggest(state).classes[0]!.assets.map(a => [a.quantity, a.amount])).toEqual([[decimal(1), 6000], [decimal(1), 2000], [decimal(1), 2000]]);
  });
  it("uses hundredths of a treasury title and reserves cents for a subcent step price", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(0, 100) });
    state = add(state, { ticker: "Treasury", assetClass: "fixed-income", sourceId: "treasury", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } }, 10, 123.45);
    expect(suggest(state, 10000)).toMatchObject({ distributed: 10000, unallocated: 0 });
    expect(suggest(state, 10000).classes[2]!.assets[0]).toMatchObject({ quantity: decimal(0.81), amount: 10000 });
  });
  it("preserves reais for fractions at the current exchange rate and floors technical precision", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: targets(50, 0, 50) });
    state = add(state, { ticker: "BTC", assetClass: "crypto" }, 10, 3);
    state = add(state, { ticker: "AAPL", assetClass: "international-stocks" }, 10, 3);
    state = run(state, { type: "record-quotes", quotes: [], exchangeRate: { rate: 50000, at: `${TODAY}T12:00:00` } });
    const result = suggest(state, 100);
    expect(result.classes.find(c => c.key === "crypto")!.assets[0]).toMatchObject({ quantity: 16666666, amount: 50 });
    expect(result.classes.find(c => c.key === "international-stocks")!.assets[0]).toMatchObject({ quantity: 3333333, amount: 50, exchangeRate: 50000 });
    expect(result).toMatchObject({ distributed: 100, unallocated: 0 });
  });
  it("adds class rounding remainder to the amount already left between classes", () => {
    let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(50), "domestic-stocks": 50 } });
    state = add(state, { ticker: "AAA", assetClass: "domestic-stocks" }, 10, 30);
    const result = suggest(state);
    expect(result.classes[0]).toMatchObject({ amount: 3000, unallocated: 2000 });
    expect(result).toMatchObject({ distributed: 3000, unallocated: 7000 });
  });
});


it("conserves cents across all five classes including treasury and private applications", () => {
  let state = run(emptyPortfolio(), { type: "save-targets", targets: { crypto: 20, "fixed-income": 20, "international-stocks": 20, "domestic-stocks": 20, "real-estate-funds": 20 } });
  state = add(state, { ticker: "STOCK", assetClass: "domestic-stocks" }, 10, 7);
  state = add(state, { ticker: "FUND", assetClass: "real-estate-funds" }, 10, 9);
  state = add(state, { ticker: "Treasury", assetClass: "fixed-income", sourceId: "treasury", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } }, 10, 123.45);
  state = add(state, { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(12), maturityDate: "2028-01-03" } });
  state = add(state, { ticker: "AAPL", assetClass: "international-stocks" }, 10, 3);
  state = add(state, { ticker: "BTC", assetClass: "crypto" }, 10, 3);
  state = run(state, { type: "record-quotes", quotes: [], exchangeRate: { rate: 50000, at: `${TODAY}T12:00:00` } });
  const result = suggest(state);
  expect(result.classes.map(c => [c.amount, c.unallocated])).toEqual([[1400, 600], [2000, 0], [1988, 12], [1800, 200], [2000, 0]]);
  expect(result.classes[2]!.assets.map(a => [a.quantity, a.amount])).toEqual([[null, 1000], [decimal(0.08), 988]]);
  expect(result).toMatchObject({ distributed: 9188, unallocated: 812 });
  expect(result.classes.flatMap(c => c.assets).reduce((sum, a) => sum + a.amount, result.unallocated)).toBe(10000);
});


it("keeps tiny quotes finite and within representable quantity precision", () => {
  let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
  state = add(state, { ticker: "AAA", assetClass: "domestic-stocks" }, 10, 0.3);
  state = add(state, { ticker: "BBB", assetClass: "domestic-stocks" }, 10, 0.00000001);
  const result = suggest(state, 100);
  expect(result).toMatchObject({ distributed: 100, unallocated: 0 });
  expect(result.classes[0]!.assets.map(a => a.amount)).toEqual([30, 70]);
  expect(result.classes[0]!.assets.every(a => Number.isSafeInteger(a.quantity))).toBe(true);
});


it("reports unallocated money when fractional quantity reaches its supported precision", () => {
  let state = run(emptyPortfolio(), { type: "save-targets", targets: targets() });
  state = add(state, { ticker: "BTC", assetClass: "crypto" }, 10, 1);
  const result = suggest(state, 10000000000);
  expect(result.classes.find(c => c.key === "crypto")!.assets[0]).toMatchObject({ quantity: Number.MAX_SAFE_INTEGER, quantityLimited: true, amount: 9007199255 });
  expect(result).toMatchObject({ distributed: 9007199255, unallocated: 992800745 });
});

it("batches repeated affordable steps when an expensive asset cannot receive the remainder", () => {
  let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
  state = add(state, { ticker: "AAA", assetClass: "domestic-stocks" }, 10, 1000000);
  state = add(state, { ticker: "BBB", assetClass: "domestic-stocks" }, 10, 0.01);
  const result = suggest(state, 100000000);
  expect(result.classes[0]!.assets.map(a => a.amount)).toEqual([0, 90071992]);
  expect(result).toMatchObject({ distributed: 90071992, unallocated: 9928008 });
});


it("batches balanced cycles between affordable recipients without changing stable ties", () => {
  let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
  state = add(state, { ticker: "AAA", assetClass: "domestic-stocks" }, 10, 1000000);
  state = add(state, { ticker: "BBB", assetClass: "domestic-stocks" }, 10, 0.01);
  state = add(state, { ticker: "CCC", assetClass: "domestic-stocks" }, 10, 0.01);
  const result = suggest(state, 100000000);
  expect(result.classes[0]!.assets.map(a => [a.quantity, a.amount])).toEqual([[0, 0], [decimal(50000000), 50000000], [decimal(50000000), 50000000]]);
  expect(result).toMatchObject({ distributed: 100000000, unallocated: 0 });
});


it("identifies precision as the reason when balanced cycles reach quantity capacity", () => {
  let state = run(emptyPortfolio(), { type: "save-targets", targets: { ...targets(0), "domestic-stocks": 100 } });
  state = add(state, { ticker: "AAA", assetClass: "domestic-stocks" }, 10, 2000000);
  for (const ticker of ["BBB", "CCC"]) state = add(state, { ticker, assetClass: "domestic-stocks" }, 10, 0.01);
  const result = suggest(state, 200000000);
  expect(result.classes[0]!.assets.slice(1).map(a => [a.amount, a.quantityLimited])).toEqual([[90071992, true], [90071992, true]]);
  expect(result).toMatchObject({ distributed: 180143984, unallocated: 19856016 });
});
