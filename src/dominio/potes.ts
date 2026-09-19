// Os seis potes são do app, não do usuário (CONTEXT.md). A ordem é a da tela.
export const POTES = [
  { id: "custos-fixos", nome: "Custos Fixos" },
  { id: "liberdade-financeira", nome: "Liberdade Financeira" },
  { id: "conforto", nome: "Conforto" },
  { id: "metas", nome: "Metas" },
  { id: "conhecimento", nome: "Conhecimento" },
  { id: "prazeres", nome: "Prazeres" },
] as const;

export type PoteId = (typeof POTES)[number]["id"];

export function ehPote(id: unknown): id is PoteId {
  return POTES.some((p) => p.id === id);
}

export function nomeDoPote(id: PoteId): string {
  return POTES.find((p) => p.id === id)!.nome;
}

/** Um inteiro de 0 a 100 por pote; os seis somam no máximo 100. */
export type Percentuais = Record<PoteId, number>;

/** A fatia da receita que os seis potes reivindicam juntos; o resto até 100 é o Não alocado. */
export function somaDosPercentuais(p: Percentuais): number {
  return POTES.reduce((soma, pote) => soma + p[pote.id], 0);
}

/**
 * Por que os percentuais não podem ser gravados, ou null se podem. Confere
 * cada campo, porque o comando chega do navegador.
 */
export function validarPercentuais(p: Percentuais): string | null {
  if (typeof p !== "object" || p === null) return "Informe os seis percentuais.";
  if (Object.keys(p).some((id) => !POTES.some((pote) => pote.id === id))) return "Só existem os seis potes.";
  for (const pote of POTES) {
    const v = p[pote.id];
    if (!Number.isInteger(v) || v < 0 || v > 100) return `${pote.nome}: o percentual é um inteiro de 0 a 100.`;
  }
  const excedente = somaDosPercentuais(p) - 100;
  if (excedente > 0) {
    return `Os percentuais somam ${excedente + 100}%: passam de 100 em ${excedente} ${excedente === 1 ? "ponto" : "pontos"}.`;
  }
  return null;
}

/** Os percentuais do primeiro mês de todos (ADR-0001). */
export const PERCENTUAIS_PADRAO: Percentuais = {
  "custos-fixos": 30,
  "liberdade-financeira": 25,
  conforto: 15,
  metas: 15,
  conhecimento: 10,
  prazeres: 5,
};
