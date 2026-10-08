import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import SQLite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase, loadState, executeOnDatabase, type Database } from "@/persistence";
import * as schema from "@/persistence/schema";
import { decimal, emptyPortfolio, projectPortfolio, type PortfolioCommand, type PortfolioState } from "@/portfolio/domain";
import { executePortfolioOnDatabase, loadPortfolio } from "@/portfolio/persistence";

const TODAY = "2026-10-08";
const STOCK_TEXTS = [
  'Empresas: Dívida Líquida/EBITDA < 2,5x? Bancos: Índice de Basileia ≥ 14%? (Histórico de 5 anos)',
  'Empresas: Liquidez Corrente > 1? Bancos: Índice de Inadimplência acima de 90 dias < 3,5%? (Histórico de 5 anos)',
  'A empresa demonstra alta eficiência operacional, mantendo Margem Líquida > 10%? (Histórico de 5 anos)',
  'A ação possui liquidez média diária maior ou igual a R$ 50 milhões?',
  'Empresas: ROE e ROIC > 10%? Bancos: ROE > 10%? (Histórico de 5 anos)',
  'A empresa apresenta crescimento composto (CAGR) de receitas ou lucros > 5% ao ano? (Histórico de 5 anos)',
  'A empresa investe amplamente em pesquisa, inovação e tecnologia, atuando em um modelo de negócio livre do risco de obsolescência? (Histórico de 5 anos)',
  'A empresa possui mais de 30 anos de mercado desde a sua fundação?',
  'O setor em que a empresa atua possui mais de 100 anos de existência e continuará sendo demandado nas próximas décadas?',
  'A empresa tem uma boa gestão? Histórico de corrupção = SEMPRE NÃO.',
  'É uma Blue Chip, líder no seu segmento ou está entre as três maiores do setor?',
  'Possui Tag Along de 100% ou está no Novo Mercado?',
  'É livre de controle estatal ou possui base diversificada de clientes, sem dependência de cliente único?',
  'Empresas: P/FCL e EV/FCL < 15? Bancos: P/L < 12x?',
];
let folder: string;
let file: string;
const opened: Database[] = [];
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "stock-questionnaire-"));
  file = path.join(folder, "portfolio.db");
});
afterEach(() => {
  for (const database of opened.splice(0)) database.close();
  rmSync(folder, { recursive: true, force: true });
});
function open() {
  const database = openDatabase(file);
  opened.push(database);
  return database;
}
function execute(database: Database, ...commands: PortfolioCommand[]) {
  for (const command of commands) {
    const result = executePortfolioOnDatabase(database, command, TODAY);
    if (!result.ok) throw new Error(result.error);
  }
  return loadPortfolio(database);
}
function legacy(fill: (database: Database) => void) {
  const migrations = path.join(folder, "migrations");
  mkdirSync(path.join(migrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 20);
  writeFileSync(path.join(migrations, "meta/_journal.json"), JSON.stringify(journal));
  for (const { tag } of journal.entries) copyFileSync(`drizzle/${tag}.sql`, path.join(migrations, `${tag}.sql`));
  const sqlite = new SQLite(file);
  try {
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: migrations });
    fill({ db, close: () => sqlite.close() });
  } finally { sqlite.close(); }
}
const assets = (state: PortfolioState) => projectPortfolio(state, TODAY).classes.flatMap(c => c.assets);

it.each(["fresh", "legacy"])("shows the fourteen ordered stock criteria in both classes on a %s database", kind => {
  if (kind === "legacy") legacy(() => {});
  const database = open();
  const state = execute(database,
    { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
    { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
  );
  for (const asset of assets(state)) {
    expect(asset.questionnaire?.questions.map(q => q.text)).toEqual(STOCK_TEXTS);
    expect(asset.questionnaire?.questions.every(q => q.answer === null)).toBe(true);
    expect(asset).toMatchObject({ score: null, evaluatedAt: null });
  }
  expect(state.questionnaires).toEqual(emptyPortfolio().questionnaires);
  const ids = state.questionnaires.flatMap(q => q.questions.map(p => p.id));
  expect(ids.every(id => Number.isSafeInteger(id) && id > 0)).toBe(true);
  expect(new Set(ids).size).toBe(20);
  expect(loadPortfolio(open())).toEqual(state);
});

it.each(["answered", "edited", "reordered", "added", "removed"])("refuses a legacy stock questionnaire that was %s without altering either context", change => {
  let before: PortfolioState;
  let budget: ReturnType<typeof loadState>;
  legacy(database => {
    execute(database, { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } });
    const questions = loadPortfolio(database).questionnaires[0]!.questions;
    if (change === "answered") execute(database, { type: "save-answer", asset: 1, question: 1, value: true });
    else execute(database, { type: "save-questionnaire", id: "stocks", questions:
      change === "edited" ? questions.map(q => q.id === 1 ? { ...q, text: "Meu critério?" } : q) :
      change === "reordered" ? [...questions].reverse() :
      change === "added" ? [...questions, { text: "Meu critério extra?" }] : questions.slice(1),
    });
    before = loadPortfolio(database);
    budget = loadState(database);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(() => open()).toThrow(/questionário de ações.*respostas ou personalizações/);
    const sqlite = new SQLite(file);
    try {
      const database = { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
      expect(loadPortfolio(database)).toEqual(before!);
      expect(loadState(database)).toEqual(budget!);
    } finally { sqlite.close(); }
  }
});

it("preserves fund customizations, evaluations and all other records, then keeps later stock edits on reopening", () => {
  let before: PortfolioState;
  let budget: ReturnType<typeof loadState>;
  legacy(database => {
    executeOnDatabase(database, { type: "save-income", income: { date: TODAY, description: "Salário", source: "salary", paymentMethod: "pix", amount: 500000 } }, TODAY);
    execute(database,
      { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } },
      { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
      { type: "save-asset", asset: { ticker: "HGLG11", assetClass: "real-estate-funds" } },
      { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" } },
      { type: "save-asset", asset: { ticker: "Tesouro 2035", assetClass: "fixed-income", sourceId: "treasury-2035", bond: { kind: "treasury-bond", maturityDate: "2035-05-15" } } },
      { type: "save-score", asset: 4, score: 8 },
      { type: "save-score", asset: 5, score: 9 },
      { type: "save-trade", trade: { asset: 1, kind: "buy", date: TODAY, quantity: decimal(10), unitPrice: decimal(30) } },
      { type: "save-payout", payout: { asset: 1, date: TODAY, kind: "dividend", amount: 1200 } },
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(32), at: `${TODAY}T12:00:00` }] },
      { type: "save-questionnaire", id: "real-estate-funds", questions: [{ id: 12, text: "Meu critério de FIIs?" }, { text: "Outro critério?" }] },
    );
    const fund = loadPortfolio(database).questionnaires[1]!;
    for (const question of fund.questions) execute(database, { type: "save-answer", asset: 3, question: question.id, value: true });
    before = loadPortfolio(database);
    budget = loadState(database);
  });
  const database = open();
  const state = loadPortfolio(database);
  expect(state).toEqual({ ...before!, questionnaires: [state.questionnaires[0], before!.questionnaires[1]] });
  expect(state.questionnaires[0]?.questions.map(q => q.text)).toEqual(STOCK_TEXTS);
  const ids = state.questionnaires.flatMap(q => q.questions.map(p => p.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(assets(state).find(a => a.id === 3)).toMatchObject({ score: 2, evaluatedAt: TODAY });
  for (const asset of [1, 2]) expect(assets(state).find(a => a.id === asset)).toMatchObject({ score: null, evaluatedAt: null });
  expect(loadState(database)).toEqual(budget!);
  const edited = execute(database, { type: "save-questionnaire", id: "stocks", questions: state.questionnaires[0]!.questions.map((q, i) => i === 0 ? { ...q, text: "Meu novo critério?" } : q) });
  for (const connection of opened.splice(0)) connection.close();
  expect(loadPortfolio(open())).toEqual(edited);
  expect(loadState(open())).toEqual(budget!);
});

it.each(["domestic-stocks", "international-stocks"] as const)("persists partial evaluations and both fourteen-question extremes for %s", assetClass => {
  const database = open();
  let state = execute(database, { type: "save-asset", asset: { ticker: "STOCK", assetClass } });
  const questions = state.questionnaires[0]!.questions;
  state = execute(database, { type: "save-answer", asset: 1, question: questions[0]!.id, value: true });
  expect(assets(state)[0]).toMatchObject({ score: null, evaluatedAt: TODAY });
  expect(assets(loadPortfolio(open()))[0]?.questionnaire?.questions.filter(q => q.answer === null)).toHaveLength(13);
  for (const question of questions.slice(1)) execute(database, { type: "save-answer", asset: 1, question: question.id, value: true });
  expect(assets(loadPortfolio(open()))[0]).toMatchObject({ score: 14, evaluatedAt: TODAY });
  for (const question of questions) execute(database, { type: "save-answer", asset: 1, question: question.id, value: false });
  expect(assets(loadPortfolio(open()))[0]).toMatchObject({ score: -14, evaluatedAt: TODAY });
});
