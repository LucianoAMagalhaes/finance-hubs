import { JARS, sumPercentages, validatePercentages, type Percentages, type Jar, type JarInView } from "@/domain";

/** O que está escrito em cada campo, como a pessoa digitou. */
export type Rascunho = Record<Jar, string>;

/** O rascunho começa com os percentuais que o mês mostra, próprios ou herdados. */
export function rascunhoDe(potes: JarInView[]): Rascunho {
  return Object.fromEntries(potes.map((p) => [p.id, String(p.percentage)])) as Rascunho;
}

/** Para a projeção ao vivo: o que não se lê como número conta como zero, e nada sai de 0 a 100. */
export function percentuaisParaPrevia(rascunho: Rascunho): Percentages {
  const lidos = lerRascunho(rascunho);
  const limitar = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
  return Object.fromEntries(JARS.map((pote) => [pote.id, limitar(lidos[pote.id])])) as Percentages;
}

/**
 * O que o editor mostra e manda: os percentuais como a pessoa os escreveu, o
 * erro de validação deles, e a soma — a da prévia, que conta cada campo como
 * a projeção o conta.
 */
export type RascunhoConferido = { percentuais: Percentages; erro: string | null; soma: number };

export function conferirRascunho(rascunho: Rascunho): RascunhoConferido {
  const percentuais = lerRascunho(rascunho);
  return { percentuais, erro: validatePercentages(percentuais), soma: sumPercentages(percentuaisParaPrevia(rascunho)) };
}

/** Os percentuais do rascunho; um campo em branco ou ilegível vira NaN, que a validação recusa. */
function lerRascunho(rascunho: Rascunho): Percentages {
  return Object.fromEntries(
    JARS.map((p) => [p.id, rascunho[p.id].trim() === "" ? NaN : Number(rascunho[p.id])]),
  ) as Percentages;
}
