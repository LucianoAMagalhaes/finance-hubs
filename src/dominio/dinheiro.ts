/** Dinheiro sempre em centavos inteiros, para que as somas nunca errem por ponto flutuante. */
export type Centavos = number;

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * "R$ 1.234,56", ou "− R$ 297,90" para negativo. Aceita fração de centavo (um
 * limite exato) e só arredonda aqui, na exibição.
 */
export function formatarReais(valor: number): string {
  const centavos = Math.round(Math.abs(valor));
  const texto = REAIS.format(centavos / 100);
  return valor < 0 && centavos > 0 ? `− ${texto}` : texto;
}
