import type { PortfolioState } from "./state";
import type { IsoDate, Result } from "@/shared";
import type { AssetClass } from "./classes";

export type Question = { id: number; text: string };
export type QuestionToSave = { id?: number; text: string };
export type Questionnaire = { id: "stocks" | "real-estate-funds"; questions: Question[] };
export type Answer = { asset: number; question: number; value: boolean };
export type QuestionnaireEvaluation = { asset: number; evaluatedAt: IsoDate };
export type QuestionnaireView = { id: Questionnaire["id"]; questions: (Question & { answer: boolean | null })[] };

/** Saves the current ordered questions together, keeping answers only for retained identities. */
export function saveQuestionnaire(state: PortfolioState, id: Questionnaire["id"], input: QuestionToSave[]): Result<PortfolioState> {
  const current = state.questionnaires.find(q => q.id === id);
  if (!current) return { ok: false, error: "Esse questionário não existe." };
  if (!Array.isArray(input)) return { ok: false, error: "Informe as perguntas do questionário." };
  if (input.length === 0) return { ok: false, error: "Mantenha pelo menos uma pergunta no questionário." };
  const retained = new Set<number>();
  let nextId = Math.max(0, ...state.questionnaires.flatMap(q => q.questions.map(p => p.id))) + 1;
  const questions: Question[] = [];
  for (const question of input) {
    if (!question || typeof question.text !== "string" || !question.text.trim()) {
      return { ok: false, error: "Escreva o texto de cada pergunta." };
    }
    if (question.id !== undefined) {
      if (!current.questions.some(p => p.id === question.id)) {
        return { ok: false, error: "Essa pergunta não pertence ao questionário." };
      }
      if (retained.has(question.id)) return { ok: false, error: "Uma pergunta não pode aparecer duas vezes." };
      retained.add(question.id);
    }
    questions.push({ id: question.id ?? nextId++, text: question.text.trim() });
  }
  const removed = new Set(current.questions.filter(p => !retained.has(p.id)).map(p => p.id));
  return { ok: true, value: {
    ...state,
    questionnaires: state.questionnaires.map(q => q.id === id ? { id, questions } : q),
    answers: state.answers.filter(a => !removed.has(a.question)),
  } };
}

export function questionnaireId(assetClass: AssetClass): Questionnaire["id"] | null {
  if (assetClass === "domestic-stocks" || assetClass === "international-stocks") return "stocks";
  if (assetClass === "real-estate-funds") return "real-estate-funds";
  return null;
}

/** Each fresh portfolio gets its own questions; database migrations seed them only once. */
export function defaultQuestionnaires(): Questionnaire[] {
  const stocks = [
    "Empresas: Dívida Líquida/EBITDA < 2,5x? Bancos: Índice de Basileia ≥ 14%? (Histórico de 5 anos)",
    "Empresas: Liquidez Corrente > 1? Bancos: Índice de Inadimplência acima de 90 dias < 3,5%? (Histórico de 5 anos)",
    "A empresa demonstra alta eficiência operacional, mantendo Margem Líquida > 10%? (Histórico de 5 anos)",
    "A ação possui liquidez média diária maior ou igual a R$ 50 milhões?",
    "Empresas: ROE e ROIC > 10%? Bancos: ROE > 10%? (Histórico de 5 anos)",
    "A empresa apresenta crescimento composto (CAGR) de receitas ou lucros > 5% ao ano? (Histórico de 5 anos)",
    "A empresa investe amplamente em pesquisa, inovação e tecnologia, atuando em um modelo de negócio livre do risco de obsolescência? (Histórico de 5 anos)",
    "A empresa possui mais de 30 anos de mercado desde a sua fundação?",
    "O setor em que a empresa atua possui mais de 100 anos de existência e continuará sendo demandado nas próximas décadas?",
    "A empresa tem uma boa gestão? Histórico de corrupção = SEMPRE NÃO.",
    "É uma Blue Chip, líder no seu segmento ou está entre as três maiores do setor?",
    "Possui Tag Along de 100% ou está no Novo Mercado?",
    "É livre de controle estatal ou possui base diversificada de clientes, sem dependência de cliente único?",
    "Empresas: P/FCL e EV/FCL < 15? Bancos: P/L < 12x?",
  ];
  const funds = [
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
  return [
    { id: "stocks", questions: stocks.map((text, index) => ({ id: index < 11 ? index + 1 : index + 7, text })) },
    { id: "real-estate-funds", questions: funds.map((text, index) => ({ id: index < 6 ? index + 12 : index + 15, text })) },
  ];
}

export function saveAnswer(state: PortfolioState, assetId: number, question: number, value: boolean, today: IsoDate): Result<PortfolioState> {
  const asset = state.assets.find(a => a.id === assetId);
  if (!asset) return { ok: false, error: "Esse ativo não existe." };
  const id = questionnaireId(asset.assetClass);
  if (id === null) return { ok: false, error: "Essa classe usa nota digitada e não aceita questionário." };
  if (!state.questionnaires.find(q => q.id === id)?.questions.some(q => q.id === question)) {
    return { ok: false, error: "Essa pergunta não pertence ao questionário do ativo." };
  }
  if (typeof value !== "boolean") return { ok: false, error: "Responda sim ou não." };
  const current = { asset: assetId, question, value };
  const answers = state.answers.some(a => a.asset === assetId && a.question === question)
    ? state.answers.map(a => a.asset === assetId && a.question === question ? current : a)
    : [...state.answers, current];
  const evaluation = { asset: assetId, evaluatedAt: today };
  const questionnaireEvaluations = state.questionnaireEvaluations.some(e => e.asset === assetId)
    ? state.questionnaireEvaluations.map(e => e.asset === assetId ? evaluation : e)
    : [...state.questionnaireEvaluations, evaluation];
  return { ok: true, value: { ...state, answers, questionnaireEvaluations } };
}
