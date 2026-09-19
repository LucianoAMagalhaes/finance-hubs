import type { Estado } from "./estado";

/**
 * A tag como é gravada: minúsculas, sem "#", espaços viram hífen, acento
 * preservado ("saude" ≠ "saúde"). Null quando não sobra nome: o lançamento
 * fica sem tag.
 */
export function normalizarTag(texto: string): string | null {
  // NFC: o acento combinado (colado de outro lugar) e o pré-composto viram a mesma tag.
  const tag = texto.normalize("NFC").trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-");
  return tag || null;
}

/** As tags que algum lançamento usa, sem repetir, em ordem alfabética: uma tag existe enquanto é usada. */
export function tagsEmUso(estado: Estado): string[] {
  return tagsDistintas(estado.lancamentos);
}

/** As tags de uma lista de lançamentos ou ocorrências, sem repetir, em ordem alfabética. */
export function tagsDistintas(registros: { tag: string | null }[]): string[] {
  const tags = new Set(registros.flatMap((r) => (r.tag ? [r.tag] : [])));
  return [...tags].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Sem vermelho (estouro), verde (entrada) e violeta (reembolso): a cor como estado fica livre.
const MATIZES = [28, 45, 170, 190, 208, 225, 318, 338] as const;

/**
 * O matiz (HSL) da cor da tag. Tag não tem cadastro, então a cor sai do nome:
 * a mesma tag tem a mesma cor em qualquer mês. Tags diferentes podem repetir cor.
 */
export function matizDaTag(tag: string): number {
  let hash = 0;
  for (const c of tag) hash = (hash * 31 + c.codePointAt(0)!) >>> 0;
  return MATIZES[hash % MATIZES.length]!;
}
