import type { PortfolioState } from "./state";
import type { IsoDate, Result } from "@/shared";
import type { AssetClass } from "./classes";

export type Question = { id: number; text: string };
export type Questionnaire = { id: "stocks" | "real-estate-funds"; questions: Question[] };
export type Answer = { asset: number; question: number; value: boolean };
export type QuestionnaireEvaluation = { asset: number; evaluatedAt: IsoDate };
export type QuestionnaireView = { id: Questionnaire["id"]; questions: (Question & { answer: boolean | null })[] };

export function questionnaireId(assetClass: AssetClass): Questionnaire["id"] | null {
  if (assetClass === "domestic-stocks" || assetClass === "international-stocks") return "stocks";
  if (assetClass === "real-estate-funds") return "real-estate-funds";
  return null;
}

/** Each fresh portfolio gets its own questions; database migrations seed them only once. */
export function defaultQuestionnaires(): Questionnaire[] {
  const stocks = [
    "ROE historicamente maior que 5%? (Considere anos anteriores).",
    "Tem um crescimento de receitas (Ou lucro) superior a 5% nos últimos 5 anos?",
    "A empresa tem um histórico de pagamento de dividendos?",
    "A empresa investe amplamente em pesquisa e inovação? Setor Obsoleto = SEMPRE NÃO",
    "Tem mais de 30 anos de mercado? (Fundação)",
    "É líder nacional ou mundial no setor em que atua? (Só considera se for LÍDER, primeira colocada)",
    "O setor em que a empresa atua tem mais de 100 anos?",
    "A empresa é uma BLUE CHIP?",
    "A empresa tem uma boa gestão? Histórico de corrupção = SEMPRE NÃO",
    "É livre de controle ESTATAL ou concentração em cliente único?",
    "Div. Líquida/EBITDA é menor que 2 nos últimos 5 anos?",
  ];
  const funds = [
    "Os imóveis desse Fundo Imobiliário estão localizados em regiões nobres?",
    "As propriedades são novas e não consomem manutenção excessiva?",
    "O fundo imobiliário está negociado abaixo do P/VP 1? (Acima de 1,5, eu descarto o investimento em qualquer hipótese)",
    "Distribui dividendos a mais de 4 anos consistentemente?",
    "Não é dependende de um único inquilino ou imóvel?",
    "O Yield está dentro ou acima da média para fundos imobiliários do mesmo tipo?",
  ];
  return [
    { id: "stocks", questions: stocks.map((text, index) => ({ id: index + 1, text })) },
    { id: "real-estate-funds", questions: funds.map((text, index) => ({ id: index + 12, text })) },
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
