import type { Entrada } from "./entradas";
import type { Antecipacao, Compra, Lancamento } from "./lancamentos";
import type { Mes } from "./mes";
import type { Percentuais } from "./potes";

/**
 * Tudo que é gravado. O que é derivado (ocorrência, limite, receita, agregados)
 * nunca entra aqui (ADR-0001, ADR-0002).
 */
export type Estado = {
  /** O orçamento de cada mês que já nasceu. Uma linha por mês, nunca apagada. */
  orcamentos: Partial<Record<Mes, Percentuais>>;
  entradas: Entrada[];
  lancamentos: Lancamento[];
};

export function estadoVazio(): Estado {
  return { orcamentos: {}, entradas: [], lancamentos: [] };
}

/** As compras do estado, vivas ou não: é nelas que as antecipações moram. */
export const compras = (estado: Estado): Compra[] => estado.lancamentos.filter((l) => l.forma === "compra");

/** A antecipação de id `id`, com o parcelado de quem ela é; null quando não existe. */
export function antecipacaoEm(estado: Estado, id: number): { parcelado: Compra; antecipacao: Antecipacao } | null {
  for (const parcelado of compras(estado)) {
    const antecipacao = parcelado.antecipacoes.find((a) => a.id === id);
    if (antecipacao) return { parcelado, antecipacao };
  }
  return null;
}
