import SQLite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, it } from "vitest";
import { loadState, executeOnDatabase } from "@/persistence";
import * as schema from "@/persistence/schema";
import { decimal, emptyPortfolio, projectPortfolio, type PortfolioState } from "@/portfolio/domain";
import { executePortfolioOnDatabase, loadPortfolio } from "@/portfolio/persistence";

import { questionnaireDatabaseFixture } from "./questionnaireDatabaseFixture";

const TODAY = "2026-10-08";
const FUND_TEXTS = [
  "Os imóveis desse Fundo Imobiliário estão localizados em regiões nobres?",
  "As propriedades são novas e não consomem manutenção excessiva?",
  "O fundo imobiliário está negociado abaixo do P/VP 1? (Acima de 1,5, eu descarto o investimento em qualquer hipótese.)",
  "Distribui dividendos há mais de 10 anos consistentemente? (Histórico de 10 anos)",
  "Não é dependente de um único inquilino ou imóvel?",
  "O Yield está dentro ou acima da média para fundos imobiliários do mesmo tipo e é superior a 7,5%?",
  "A vacância física e a vacância financeira são ≤ 5%? (Histórico de 10 anos)",
  "A maior parte dos contratos é do tipo atípico ou possui WAULT (prazo médio de vencimento dos contratos) superior a 5 anos?",
  "A liquidez média diária do fundo é superior a R$ 5 milhões/dia?",
  "A gestora tem bom histórico de mercado, com gestão ativa, e as taxas de administração/performance estão alinhadas com o setor e são < 2%?",
  "A alavancagem financeira é ≤ 15%?",
  "DY é maior que FFO, ou seja, o fundo distribui mais que gerou? (Histórico de 10 anos)",
];
const fixture = questionnaireDatabaseFixture(21, TODAY);
const { open, execute, legacy, close } = fixture;
const assets = (state: PortfolioState) => projectPortfolio(state, TODAY).classes.flatMap(c => c.assets);

it.each(["fresh", "legacy"])("shows the twelve ordered fund criteria with unanswered assets on a %s database", kind => {
  if (kind === "legacy") legacy(() => {});
  const database = open();
  const state = execute(database, { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } });
  const asset = assets(state)[0]!;
  expect(asset.questionnaire?.questions.map(q => q.text)).toEqual(FUND_TEXTS);
  expect(asset.questionnaire?.questions.every(q => q.answer === null)).toBe(true);
  expect(asset).toMatchObject({ score: null, evaluatedAt: null });
  expect(state.answers).toEqual([]);
  expect(state.questionnaireEvaluations).toEqual([]);
  expect(state.questionnaires).toEqual(emptyPortfolio().questionnaires);
  const ids = state.questionnaires.flatMap(q => q.questions.map(p => p.id));
  expect(ids.every(id => Number.isSafeInteger(id) && id > 0)).toBe(true);
  expect(new Set(ids).size).toBe(26);
  expect(loadPortfolio(open())).toEqual(state);
});

it.each(["answered", "edited", "reordered", "added", "removed"])("refuses a legacy fund questionnaire that was %s without altering either context", change => {
  let before: PortfolioState;
  let budget: ReturnType<typeof loadState>;
  legacy(database => {
    execute(database, { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } });
    const questions = loadPortfolio(database).questionnaires[1]!.questions;
    if (change === "answered") execute(database, { type: "save-answer", asset: 1, question: 12, value: true });
    else execute(database, { type: "save-questionnaire", id: "real-estate-funds", questions:
      change === "edited" ? questions.map(q => q.id === 12 ? { ...q, text: "Meu critério?" } : q) :
      change === "reordered" ? [...questions].reverse() :
      change === "added" ? [...questions, { text: "Meu critério extra?" }] : questions.slice(1),
    });
    before = loadPortfolio(database);
    budget = loadState(database);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(() => open()).toThrow(/questionário de FIIs.*respostas ou personalizações/);
    const sqlite = new SQLite(fixture.file);
    try {
      const database = { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
      expect(loadPortfolio(database)).toEqual(before!);
      expect(loadState(database)).toEqual(budget!);
    } finally { sqlite.close(); }
  }
});


it("preserves customized and evaluated stocks and other records while updating funds once", () => {
  let before: PortfolioState;
  let budget: ReturnType<typeof loadState>;
  legacy(database => {
    const income = executeOnDatabase(database, { type: "save-income", income: { date: TODAY, description: "Salário", source: "salary", paymentMethod: "pix", amount: 500000 } }, TODAY);
    if (!income.ok) throw new Error(income.error);
    execute(database,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
      { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } },
      { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" } },
      { type: "save-asset", asset: { ticker: "Tesouro 2035", assetClass: "fixed-income", sourceId: "treasury-2035", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } } },
      { type: "save-score", asset: 4, score: 8 },
      { type: "save-score", asset: 5, score: 9 },
      { type: "save-targets", targets: { "domestic-stocks": 45, "international-stocks": 15, "real-estate-funds": 20, crypto: 10, "fixed-income": 10 } },
      { type: "save-trade", trade: { asset: 3, kind: "buy", date: TODAY, quantity: decimal(10), unitPrice: decimal(130) } },
      { type: "save-payout", payout: { asset: 3, date: TODAY, kind: "fund-income", amount: 1200 } },
      { type: "record-quotes", quotes: [{ asset: 3, price: decimal(132), at: `${TODAY}T12:00:00` }] },
      { type: "save-questionnaire", id: "stocks", questions: [{ id: 1, text: "Meu critério de ações?" }, { text: "Outro critério?" }] },
    );
    const stocks = loadPortfolio(database).questionnaires[0]!;
    for (const asset of [1, 2]) for (const question of stocks.questions) execute(database, { type: "save-answer", asset, question: question.id, value: true });
    before = loadPortfolio(database);
    budget = loadState(database);
  });
  const database = open();
  const state = loadPortfolio(database);
  expect(state).toEqual({ ...before!, questionnaires: [before!.questionnaires[0], state.questionnaires[1]] });
  expect(state.questionnaires[1]?.questions.map(q => q.text)).toEqual(FUND_TEXTS);
  const ids = state.questionnaires.flatMap(q => q.questions.map(p => p.id));
  expect(new Set(ids).size).toBe(ids.length);
  for (const asset of [1, 2]) expect(assets(state).find(a => a.id === asset)).toMatchObject({ score: 2, evaluatedAt: TODAY });
  expect(assets(state).find(a => a.id === 3)).toMatchObject({ score: null, evaluatedAt: null });
  expect(loadState(database)).toEqual(budget!);
  close();
  const reopened = open();
  expect(loadPortfolio(reopened)).toEqual(state);
  const edited = execute(reopened, { type: "save-questionnaire", id: "real-estate-funds", questions: state.questionnaires[1]!.questions.map((q, i) => i === 0 ? { ...q, text: "Meu novo critério?" } : q) });
  close();
  expect(loadPortfolio(open())).toEqual(edited);
  expect(loadState(open())).toEqual(budget!);
});

it("persists partial evaluations, both twelve-question extremes and the uniform DY/FFO score", () => {
  const database = open();
  let state = execute(database, { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } });
  const questions = state.questionnaires[1]!.questions;
  state = execute(database, { type: "save-answer", asset: 1, question: questions[0]!.id, value: true });
  expect(assets(state)[0]).toMatchObject({ score: null, evaluatedAt: TODAY });
  expect(assets(loadPortfolio(open()))[0]?.questionnaire?.questions.filter(q => q.answer === null)).toHaveLength(11);
  for (const question of questions.slice(1)) execute(database, { type: "save-answer", asset: 1, question: question.id, value: true });
  expect(assets(loadPortfolio(open()))[0]).toMatchObject({ score: 12, evaluatedAt: TODAY });
  for (const question of questions) execute(database, { type: "save-answer", asset: 1, question: question.id, value: false });
  expect(assets(loadPortfolio(open()))[0]).toMatchObject({ score: -12, evaluatedAt: TODAY });
  const result = executePortfolioOnDatabase(database, { type: "save-answer", asset: 1, question: questions.at(-1)!.id, value: true }, "2026-10-09");
  expect(result.ok).toBe(true);
  const asset = assets(loadPortfolio(open()))[0]!;
  expect(asset).toMatchObject({ score: -10, evaluatedAt: "2026-10-09" });
  expect(asset.questionnaire?.questions.at(-1)).toMatchObject({ text: FUND_TEXTS.at(-1), answer: true });
});
