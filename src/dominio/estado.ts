import type { Entrada } from "./entradas";
import type { Lancamento } from "./lancamentos";
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
