import { POTES, somaDosPercentuais, validarPercentuais, type Percentuais, type PoteId, type PoteNaVista } from "@/dominio";

/** O que está escrito em cada campo, como a pessoa digitou. */
export type Rascunho = Record<PoteId, string>;

/** O rascunho começa com os percentuais que o mês mostra, próprios ou herdados. */
export function rascunhoDe(potes: PoteNaVista[]): Rascunho {
  return Object.fromEntries(potes.map((p) => [p.id, String(p.percentual)])) as Rascunho;
}

/** Para a projeção ao vivo: o que não se lê como número conta como zero, e nada sai de 0 a 100. */
export function percentuaisParaPrevia(rascunho: Rascunho): Percentuais {
  const lidos = lerRascunho(rascunho);
  const limitar = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
  return Object.fromEntries(POTES.map((pote) => [pote.id, limitar(lidos[pote.id])])) as Percentuais;
}

/**
 * O que o editor mostra e manda: os percentuais como a pessoa os escreveu, o
 * erro de validação deles, e a soma — a da prévia, que conta cada campo como
 * a projeção o conta.
 */
export type RascunhoConferido = { percentuais: Percentuais; erro: string | null; soma: number };

export function conferirRascunho(rascunho: Rascunho): RascunhoConferido {
  const percentuais = lerRascunho(rascunho);
  return { percentuais, erro: validarPercentuais(percentuais), soma: somaDosPercentuais(percentuaisParaPrevia(rascunho)) };
}

/** Os percentuais do rascunho; um campo em branco ou ilegível vira NaN, que a validação recusa. */
function lerRascunho(rascunho: Rascunho): Percentuais {
  return Object.fromEntries(
    POTES.map((p) => [p.id, rascunho[p.id].trim() === "" ? NaN : Number(rascunho[p.id])]),
  ) as Percentuais;
}
