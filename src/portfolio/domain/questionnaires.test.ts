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
  it("starts with the shared fourteen stock questions and twelve fund questions in research order", () => {
    let state = emptyPortfolio();
    for (const [ticker, assetClass] of [["PETR4", "domestic-stocks"], ["QQQ", "international-stocks"], ["VNQ", "international-stocks"], ["HGLG11", "real-estate-funds"]] as const) {
      state = run(state, { type: "save-asset", asset: { ticker, assetClass } });
    }
    expect(state.questionnaires).toHaveLength(2);
    expect(viewOf(state, 1).questionnaire).toEqual(viewOf(state, 2).questionnaire);
    expect(viewOf(state, 2).questionnaire).toEqual(viewOf(state, 3).questionnaire);
    expect(viewOf(state, 1).questionnaire?.questions).toHaveLength(14);
    expect(viewOf(state, 4).questionnaire?.questions).toHaveLength(12);
    expect(viewOf(state, 1).questionnaire?.questions[0]?.text).toBe("Empresas: Dívida Líquida/EBITDA < 2,5x? Bancos: Índice de Basileia ≥ 14%? (Histórico de 5 anos)");
    expect(viewOf(state, 1)).toMatchObject({ score: null, evaluatedAt: null });
    expect(new Set(state.questionnaires.flatMap(q => q.questions.map(p => p.id))).size).toBe(26);
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
  for (const { id: question } of original.questionnaires[0]!.questions.slice(1)) state = run(state, { type: "save-answer", asset: 1, question, value: true });
  expect(viewOf(state, 1)).toMatchObject({ score: 14, evaluatedAt: TODAY });
  expect(viewOf(state, 1).tags).not.toContain("no-score");
  state = run(state, { type: "save-answer", asset: 1, question: 1, value: false }, "2026-10-02");
  expect(viewOf(state, 1)).toMatchObject({ score: 12, evaluatedAt: "2026-10-02" });
  for (const { id: question } of original.questionnaires[0]!.questions.slice(1)) state = run(state, { type: "save-answer", asset: 1, question, value: false }, "2026-10-03");
  expect(viewOf(state, 1)).toMatchObject({ score: -14, evaluatedAt: "2026-10-03", tags: expect.arrayContaining(["non-positive-score"]) });
  expect(viewOf(state, 2)).toMatchObject({ score: null, evaluatedAt: null });
  expect(state.answers).toHaveLength(14);
});

it("distinguishes a fund's missing score, zero and both twelve-question extremes", () => {
  let state = run(emptyPortfolio(), { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } });
  expect(viewOf(state, 1).score).toBeNull();
  for (const { id: question } of state.questionnaires[1]!.questions) state = run(state, { type: "save-answer", asset: 1, question, value: true });
  expect(viewOf(state, 1).score).toBe(12);
  for (const { id: question } of state.questionnaires[1]!.questions.slice(0, 6)) state = run(state, { type: "save-answer", asset: 1, question, value: false });
  expect(viewOf(state, 1)).toMatchObject({ score: 0, tags: expect.arrayContaining(["non-positive-score"]) });
  expect(viewOf(state, 1).tags).not.toContain("no-score");
  for (const { id: question } of state.questionnaires[1]!.questions.slice(6)) state = run(state, { type: "save-answer", asset: 1, question, value: false });
  expect(viewOf(state, 1).score).toBe(-12);
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
  for (const { id: question } of state.questionnaires[0]!.questions) state = run(state, { type: "save-answer", asset: 3, question, value: true });
  expect(viewOf(state, 3)).toMatchObject({ score: 14, evaluatedAt: TODAY });
  expect(viewOf(state, 1)).toMatchObject({ score: null, evaluatedAt: null });
});

function evaluatedClasses(): PortfolioState {
  let state = emptyPortfolio();
  for (const [ticker, assetClass] of [["PETR4", "domestic-stocks"], ["AAPL", "international-stocks"], ["HGLG11", "real-estate-funds"]] as const) {
    state = run(state, { type: "save-asset", asset: { ticker, assetClass } });
    const asset = state.assets.at(-1)!;
    for (const question of viewOf(state, asset.id).questionnaire!.questions) {
      state = run(state, { type: "save-answer", asset: asset.id, question: question.id, value: question.id !== 1 });
    }
  }
  return state;
}

it("adding a stock question makes both stock classes pending while funds and evaluation dates stay unchanged", () => {
  const original = evaluatedClasses();
  const state = run(original, {
    type: "save-questionnaire", id: "stocks",
    questions: [...original.questionnaires[0]!.questions, { text: "Tem receita recorrente?" }],
  }, "2026-10-02");
  for (const asset of [1, 2]) {
    expect(viewOf(state, asset)).toMatchObject({ score: null, evaluatedAt: TODAY });
    expect(viewOf(state, asset).questionnaire?.questions.at(-1)).toMatchObject({ text: "Tem receita recorrente?", answer: null });
  }
  expect(projectPortfolio(state, TODAY).pendingEvaluations).toBe(2);
  expect(viewOf(state, 3)).toEqual(viewOf(original, 3));
  expect(viewOf(original, 1).score).toBe(12);
  const question = viewOf(state, 1).questionnaire!.questions.at(-1)!.id;
  const completed = run(state, { type: "save-answer", asset: 1, question, value: true }, "2026-10-03");
  expect(viewOf(completed, 1)).toMatchObject({ score: 13, evaluatedAt: "2026-10-03" });
  expect(projectPortfolio(completed, TODAY).pendingEvaluations).toBe(1);
});

it("rewrites and reorders stock questions by identity without changing either stock score, answers or dates", () => {
  const original = evaluatedClasses();
  const questions = [...original.questionnaires[0]!.questions].reverse().map(q => q.id === 1 ? { ...q, text: "  Minha nova redação?  " } : q);
  const state = run(original, { type: "save-questionnaire", id: "stocks", questions }, "2026-10-02");
  for (const asset of [1, 2]) {
    expect(viewOf(state, asset)).toMatchObject({ score: 12, evaluatedAt: TODAY });
    expect(viewOf(state, asset).questionnaire?.questions.map(q => q.id)).toEqual([20, 19, 18, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(viewOf(state, asset).questionnaire?.questions.at(-1)).toEqual({ id: 1, text: "Minha nova redação?", answer: false });
  }
  expect(state.answers).toEqual(original.answers);
  expect(state.questionnaireEvaluations).toEqual(original.questionnaireEvaluations);
  expect(viewOf(state, 3)).toEqual(viewOf(original, 3));
  expect(original.questionnaires[0]?.questions[0]?.text).toContain("Basileia");
});

it("removes answers for both stock classes and recomputes their scores without changing dates", () => {
  const original = evaluatedClasses();
  const state = run(original, { type: "save-questionnaire", id: "stocks", questions: original.questionnaires[0]!.questions.slice(1) }, "2026-10-02");
  expect(state.answers.some(a => a.question === 1)).toBe(false);
  for (const asset of [1, 2]) expect(viewOf(state, asset)).toMatchObject({ score: 13, evaluatedAt: TODAY });
  expect(viewOf(state, 3)).toEqual(viewOf(original, 3));
  expect(apply(state, { type: "save-answer", asset: 1, question: 1, value: true }, TODAY).ok).toBe(false);
});

it("adds and removes fund questions independently and completes pending evaluations by removing the unanswered question", () => {
  const original = evaluatedClasses();
  const pending = run(original, { type: "save-questionnaire", id: "real-estate-funds", questions: [...original.questionnaires[1]!.questions, { text: "Tem vários imóveis?" }] }, "2026-10-02");
  expect(viewOf(pending, 3)).toMatchObject({ score: null, evaluatedAt: TODAY });
  expect(projectPortfolio(pending, TODAY).pendingEvaluations).toBe(1);
  for (const asset of [1, 2]) expect(viewOf(pending, asset)).toEqual(viewOf(original, asset));
  const completed = run(pending, { type: "save-questionnaire", id: "real-estate-funds", questions: original.questionnaires[1]!.questions }, "2026-10-03");
  expect(viewOf(completed, 3)).toMatchObject({ score: 12, evaluatedAt: TODAY });
  expect(projectPortfolio(completed, TODAY).pendingEvaluations).toBe(0);
});

it.each(["stocks", "real-estate-funds"] as const)("protects the last question in %s and keeps its answers and date", id => {
  const original = evaluatedClasses();
  const question = original.questionnaires.find(q => q.id === id)!.questions[0]!;
  const state = run(original, { type: "save-questionnaire", id, questions: [question] });
  const before = projectPortfolio(state, TODAY);
  expect(apply(state, { type: "save-questionnaire", id, questions: [] }, "2026-10-02")).toEqual({ ok: false, error: "Mantenha pelo menos uma pergunta no questionário." });
  expect(projectPortfolio(state, TODAY)).toEqual(before);
  expect(viewOf(state, id === "stocks" ? 1 : 3)).toMatchObject({ score: id === "stocks" ? -1 : 1, evaluatedAt: TODAY });
});

it("refuses missing questionnaires, foreign or repeated identities and malformed questions without changing state", () => {
  const state = evaluatedClasses();
  const before = projectPortfolio(state, TODAY);
  for (const [input, error] of [
    [{ id: "crypto", questions: [{ text: "Pergunta?" }] }, "Esse questionário não existe."],
    [{ id: "stocks", questions: null }, "Informe as perguntas do questionário."],
    [{ id: "stocks", questions: [null] }, "Escreva o texto de cada pergunta."],
    [{ id: "stocks", questions: [{ text: 123 }] }, "Escreva o texto de cada pergunta."],
    [{ id: "stocks", questions: [{ text: "   " }] }, "Escreva o texto de cada pergunta."],
    [{ id: "stocks", questions: [{ id: 12, text: "Pergunta?" }] }, "Essa pergunta não pertence ao questionário."],
    [{ id: "stocks", questions: [{ id: 999, text: "Pergunta?" }] }, "Essa pergunta não pertence ao questionário."],
    [{ id: "stocks", questions: [{ id: 1, text: "Pergunta?" }, { id: 1, text: "Outra?" }] }, "Uma pergunta não pode aparecer duas vezes."],
  ] as const) {
    const command: PortfolioCommand = JSON.parse(JSON.stringify({ type: "save-questionnaire", ...input }));
    expect(apply(state, command, TODAY)).toEqual({ ok: false, error });
  }
  expect(projectPortfolio(state, TODAY)).toEqual(before);
});
