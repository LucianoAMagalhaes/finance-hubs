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

/** Um inteiro de 0 a 100 por pote; os seis somam no máximo 100. */
export type Percentuais = Record<PoteId, number>;

/** Os percentuais do primeiro mês de todos (ADR-0001). */
export const PERCENTUAIS_PADRAO: Percentuais = {
  "custos-fixos": 30,
  "liberdade-financeira": 25,
  conforto: 15,
  metas: 15,
  conhecimento: 10,
  prazeres: 5,
};
