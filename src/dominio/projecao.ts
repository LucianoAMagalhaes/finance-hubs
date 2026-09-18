import type { Centavos } from "./dinheiro";
import type { Estado } from "./estado";
import type { Mes } from "./mes";
import { PERCENTUAIS_PADRAO, POTES, type Percentuais, type PoteId } from "./potes";

export type OrcamentoNaVista = {
  /** Se o mês já tem o seu orçamento gravado. Antes de nascer, só mostra o que herdaria. */
  nascido: boolean;
  /** De que mês viriam os percentuais de um mês não nascido; null quando seriam os padrão. */
  herdadoDe: Mes | null;
};

export type Veredito = "estourou" | "sobra" | "sem-receita";

export type PoteNaVista = {
  id: PoteId;
  nome: string;
  percentual: number;
  /** Soma líquida das ocorrências do pote no mês. */
  total: Centavos;
  /** `percentual × receita`, exato (pode ter fração de centavo); null quando o mês não tem receita. */
  limite: number | null;
  veredito: Veredito;
};

export type AgregadosDoMes = {
  receitas: Centavos;
  despesas: Centavos;
  saldoDoMes: Centavos;
  saldoEmConta: Centavos;
};

export type VistaDoMes = {
  mes: Mes;
  orcamento: OrcamentoNaVista;
  /** Soma das entradas do mês. */
  receita: Centavos;
  potes: PoteNaVista[];
  /** Pontos percentuais da receita que nenhum pote reivindica. */
  naoAlocado: number;
  agregados: AgregadosDoMes;
};

/** Tudo que a tela do mês mostra, derivado do estado. Ler nunca faz um mês nascer. */
export function projetarMes(estado: Estado, mes: Mes): VistaDoMes {
  const { percentuais, ...orcamento } = percentuaisEfetivos(estado, mes);
  // Ainda não há entradas nem lançamentos no estado: a receita e os totais são zero.
  const receita = 0;
  const despesas = 0;
  return {
    mes,
    orcamento,
    receita,
    potes: POTES.map((p) => ({
      id: p.id,
      nome: p.nome,
      percentual: percentuais[p.id],
      total: 0,
      limite: null,
      veredito: "sem-receita",
    })),
    naoAlocado: 100 - POTES.reduce((soma, p) => soma + percentuais[p.id], 0),
    agregados: { receitas: receita, despesas, saldoDoMes: receita - despesas, saldoEmConta: receita },
  };
}

function percentuaisEfetivos(estado: Estado, mes: Mes): OrcamentoNaVista & { percentuais: Percentuais } {
  const proprio = estado.orcamentos[mes];
  if (proprio) return { percentuais: proprio, nascido: true, herdadoDe: null };
  const { percentuais, de } = herdaria(estado, mes);
  return { percentuais, nascido: false, herdadoDe: de };
}

/**
 * O que um mês receberia ao nascer: os percentuais do mês anterior no tempo mais
 * recente que já tem orçamento, ou os padrão se não há nenhum (ADR-0001).
 */
export function herdaria(estado: Estado, mes: Mes): { percentuais: Percentuais; de: Mes | null } {
  const anteriores = (Object.keys(estado.orcamentos) as Mes[]).filter((m) => m < mes).sort();
  const de = anteriores.at(-1);
  const percentuais = de && estado.orcamentos[de];
  return percentuais ? { percentuais, de } : { percentuais: PERCENTUAIS_PADRAO, de: null };
}
