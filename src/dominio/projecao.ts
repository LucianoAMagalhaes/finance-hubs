import type { Centavos } from "./dinheiro";
import type { Entrada } from "./entradas";
import type { Estado } from "./estado";
import { mesDaData, type Mes } from "./mes";
import { PERCENTUAIS_PADRAO, POTES, somaDosPercentuais, type Percentuais, type PoteId } from "./potes";

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

export type NaoAlocado = {
  /** Pontos percentuais da receita que nenhum pote reivindica. */
  percentual: number;
  /** Em reais, exato como o limite; null quando o mês não tem receita. */
  valor: number | null;
};

export type VistaDoMes = {
  mes: Mes;
  orcamento: OrcamentoNaVista;
  /** Soma das entradas do mês. */
  receita: Centavos;
  potes: PoteNaVista[];
  naoAlocado: NaoAlocado;
  agregados: AgregadosDoMes;
  /** As entradas com data no mês, em ordem de data. */
  entradas: Entrada[];
};

/**
 * Tudo que a tela do mês mostra, derivado do estado. Ler nunca faz um mês nascer.
 * `percentuaisEmEdicao` são os que a pessoa está digitando: a vista é
 * recalculada com eles, sem que nada seja gravado, e o mês continua nascido ou não.
 */
export function projetarMes(estado: Estado, mes: Mes, percentuaisEmEdicao?: Percentuais): VistaDoMes {
  const { percentuais: efetivos, ...orcamento } = percentuaisEfetivos(estado, mes);
  const percentuais = percentuaisEmEdicao ?? efetivos;
  const entradas = estado.entradas
    .filter((e) => mesDaData(e.data) === mes)
    .sort((a, b) => (a.data === b.data ? a.id - b.id : a.data < b.data ? -1 : 1));
  const receita = entradas.reduce((soma, e) => soma + e.valor, 0);
  // Sem receita, não há limite: um mês cuja receita ainda não se conhece não estoura.
  const limiteDe = (percentual: number) => (receita > 0 ? (percentual * receita) / 100 : null);
  // Ainda não há lançamentos no estado: os totais dos potes são zero.
  const despesas = 0;
  // Percentuais em edição podem passar de 100; o não alocado nunca é negativo.
  const naoAlocado = Math.max(0, 100 - somaDosPercentuais(percentuais));
  return {
    mes,
    orcamento,
    receita,
    potes: POTES.map((p) => {
      const total = 0;
      const limite = limiteDe(percentuais[p.id]);
      return {
        id: p.id,
        nome: p.nome,
        percentual: percentuais[p.id],
        total,
        limite,
        veredito: limite === null ? "sem-receita" : total > limite ? "estourou" : "sobra",
      };
    }),
    naoAlocado: { percentual: naoAlocado, valor: limiteDe(naoAlocado) },
    agregados: { receitas: receita, despesas, saldoDoMes: receita - despesas, saldoEmConta: receita },
    entradas,
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
