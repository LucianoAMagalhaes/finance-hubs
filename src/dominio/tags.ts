import type { Estado } from "./estado";
import { vivos } from "./lixeira";

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

/**
 * As tags que algum lançamento fora da lixeira usa, em qualquer vigência de um
 * recorrente, sem repetir, em ordem alfabética: uma tag existe enquanto é usada.
 */
export function tagsEmUso(estado: Estado): string[] {
  return tagsDistintas(vivos(estado.lancamentos).flatMap<{ tag: string | null }>((l) => (l.forma === "compra" ? [l] : l.vigencias)));
}

/**
 * Quantos lançamentos fora da lixeira usam a tag: o tamanho de uma renomeação,
 * que a tela mostra antes de fundir duas. Um recorrente conta uma vez só, ainda
 * que várias vigências suas a usem.
 */
export function lancamentosComATag(estado: Estado, tag: string): number {
  return vivos(estado.lancamentos).filter((l) => (l.forma === "compra" ? l.tag === tag : l.vigencias.some((v) => v.tag === tag))).length;
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
