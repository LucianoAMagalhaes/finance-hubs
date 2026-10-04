import { describe, expect, it } from "vitest";
import { apply, emptyPortfolio, projectPortfolio, type IsoDate, type PortfolioCommand, type PortfolioState } from "@/portfolio/domain";

const TODAY = "2026-10-01";
function run(state: PortfolioState, command: PortfolioCommand, today: IsoDate = TODAY): PortfolioState {
  const result = apply(state, command, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const viewOf = (state: PortfolioState, id: number) => projectPortfolio(state, TODAY).classes.flatMap(c => c.assets).find(a => a.id === id)!;

describe("questionnaire evaluations through the portfolio", () => {
  it("starts with the shared eleven stock questions and six fund questions in research order", () => {
    let state = emptyPortfolio();
    for (const [ticker, assetClass] of [["PETR4", "domestic-stocks"], ["QQQ", "international-stocks"], ["VNQ", "international-stocks"], ["HGLG11", "real-estate-funds"]] as const) {
      state = run(state, { type: "save-asset", asset: { ticker, assetClass } });
    }
    expect(state.questionnaires).toHaveLength(2);
    expect(viewOf(state, 1).questionnaire).toEqual(viewOf(state, 2).questionnaire);
    expect(viewOf(state, 2).questionnaire).toEqual(viewOf(state, 3).questionnaire);
    expect(viewOf(state, 1).questionnaire?.questions).toHaveLength(11);
    expect(viewOf(state, 4).questionnaire?.questions).toHaveLength(6);
    expect(viewOf(state, 1).questionnaire?.questions[0]?.text).toBe("ROE historicamente maior que 5%? (Considere anos anteriores).");
    expect(viewOf(state, 1)).toMatchObject({ score: null, evaluatedAt: null });
    expect(new Set(state.questionnaires.flatMap(q => q.questions.map(p => p.id))).size).toBe(17);
  });
});

function stocks(): PortfolioState {
  let state = emptyPortfolio();
  for (const ticker of ["PETR4", "VALE3"]) state = run(state, { type: "save-asset", asset: { ticker, assetClass: "domestic-stocks" } });
  return state;
}

it("keeps incomplete evaluations without a provisional score, reaches both extremes and corrects only this asset", () => {
  const original = stocks();
  let state = run(original, { type: "save-answer", asset: 1, question: 1, value: true });
  expect(viewOf(state, 1)).toMatchObject({ score: null, evaluatedAt: TODAY, tags: expect.arrayContaining(["no-score"]) });
  expect(viewOf(state, 1).questionnaire?.questions[0]?.answer).toBe(true);
  expect(viewOf(original, 1).questionnaire?.questions[0]?.answer).toBeNull();
  for (let question = 2; question <= 11; question++) state = run(state, { type: "save-answer", asset: 1, question, value: true });
  expect(viewOf(state, 1)).toMatchObject({ score: 11, evaluatedAt: TODAY });
  expect(viewOf(state, 1).tags).not.toContain("no-score");
  state = run(state, { type: "save-answer", asset: 1, question: 1, value: false }, "2026-10-02");
  expect(viewOf(state, 1)).toMatchObject({ score: 9, evaluatedAt: "2026-10-02" });
  for (let question = 2; question <= 11; question++) state = run(state, { type: "save-answer", asset: 1, question, value: false }, "2026-10-03");
  expect(viewOf(state, 1)).toMatchObject({ score: -11, evaluatedAt: "2026-10-03", tags: expect.arrayContaining(["non-positive-score"]) });
  expect(viewOf(state, 2)).toMatchObject({ score: null, evaluatedAt: null });
  expect(state.answers).toHaveLength(11);
});

it("distinguishes a fund's missing score, zero and both six-question extremes", () => {
  let state = run(emptyPortfolio(), { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } });
  expect(viewOf(state, 1).score).toBeNull();
  for (let question = 12; question <= 17; question++) state = run(state, { type: "save-answer", asset: 1, question, value: true });
  expect(viewOf(state, 1).score).toBe(6);
  for (let question = 12; question <= 14; question++) state = run(state, { type: "save-answer", asset: 1, question, value: false });
  expect(viewOf(state, 1)).toMatchObject({ score: 0, tags: expect.arrayContaining(["non-positive-score"]) });
  expect(viewOf(state, 1).tags).not.toContain("no-score");
  for (let question = 15; question <= 17; question++) state = run(state, { type: "save-answer", asset: 1, question, value: false });
  expect(viewOf(state, 1).score).toBe(-6);
});

it("refuses incompatible questions, manual-score classes, missing assets and non-boolean answers", () => {
  let state = stocks();
  for (const asset of [
    { ticker: "BTC", assetClass: "crypto" },
    { ticker: "Tesouro 2035", assetClass: "fixed-income", sourceId: "treasury-2035", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } },
    { ticker: "HGLG11", assetClass: "real-estate-funds" },
  ] as const) state = run(state, { type: "save-asset", asset });
  for (const [asset, question] of [[1, 12], [5, 1], [1, 999]]) {
    expect(apply(state, { type: "save-answer", asset: asset!, question: question!, value: true }, TODAY)).toEqual({ ok: false, error: "Essa pergunta não pertence ao questionário do ativo." });
  }
  for (const asset of [3, 4]) {
    expect(viewOf(state, asset).questionnaire).toBeNull();
    expect(apply(state, { type: "save-answer", asset, question: 1, value: true }, TODAY)).toEqual({ ok: false, error: "Essa classe usa nota digitada e não aceita questionário." });
  }
  expect(apply(state, { type: "save-answer", asset: 99, question: 1, value: true }, TODAY)).toEqual({ ok: false, error: "Esse ativo não existe." });
  // JSON commands can reach the public boundary without TypeScript validation.
  const invalid: PortfolioCommand = JSON.parse('{"type":"save-answer","asset":1,"question":1,"value":"yes"}');
  expect(apply(state, invalid, TODAY)).toEqual({ ok: false, error: "Responda sim ou não." });
  expect(state.answers).toEqual([]);
});

it("removes answers and the evaluation date when an unused asset is deleted", () => {
  let state = run(stocks(), { type: "save-answer", asset: 1, question: 1, value: true });
  state = run(state, { type: "save-answer", asset: 2, question: 1, value: false });
  state = run(state, { type: "delete-asset", id: 1 });
  expect(state.answers).toEqual([{ asset: 2, question: 1, value: false }]);
  expect(state.questionnaireEvaluations).toEqual([{ asset: 2, evaluatedAt: TODAY }]);
  expect(viewOf(state, 2).questionnaire?.questions[0]?.answer).toBe(false);
});


it.each(["QQQ", "VNQ"])("evaluates an international ETF or REIT with stock questions: %s", ticker => {
  let state = run(stocks(), { type: "save-asset", asset: { ticker, assetClass: "international-stocks" } });
  for (let question = 1; question <= 11; question++) state = run(state, { type: "save-answer", asset: 3, question, value: true });
  expect(viewOf(state, 3)).toMatchObject({ score: 11, evaluatedAt: TODAY });
  expect(viewOf(state, 1)).toMatchObject({ score: null, evaluatedAt: null });
});
