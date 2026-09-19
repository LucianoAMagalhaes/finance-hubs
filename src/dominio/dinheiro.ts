/** Dinheiro sempre em centavos inteiros, para que as somas nunca errem por ponto flutuante. */
export type Centavos = number;

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const COM_VIRGULA = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/;
const PONTO_DECIMAL = /^(\d+)(?:\.(\d{1,2}))?$/;
const PONTO_DE_MILHAR = /^\d{1,3}(?:\.\d{3})+$/;

/**
 * Reais digitados ("7.200,00", "7200,5", "1234.56") em centavos inteiros, sem
 * passar por ponto flutuante. Null quando o texto não é um valor que se saiba ler.
 */
export function reaisParaCentavos(texto: string): Centavos | null {
  const t = texto.replace(/R\$/g, "").replace(/\s/g, "");
  let inteiro: string;
  let fracao = "";
  const v = COM_VIRGULA.exec(t);
  const p = PONTO_DECIMAL.exec(t);
  if (v) [inteiro, fracao] = [v[1]!, v[2]!];
  else if (p) [inteiro, fracao] = [p[1]!, p[2] ?? ""];
  else if (PONTO_DE_MILHAR.test(t)) inteiro = t;
  else return null;
  return Number(inteiro.replace(/\./g, "")) * 100 + Number(fracao.padEnd(2, "0"));
}

/**
 * "R$ 1.234,56", ou "− R$ 297,90" para negativo. Aceita fração de centavo (um
 * limite exato) e só arredonda aqui, na exibição.
 */
export function formatarReais(valor: number): string {
  const centavos = Math.round(Math.abs(valor));
  const texto = REAIS.format(centavos / 100);
  return valor < 0 && centavos > 0 ? `− ${texto}` : texto;
}
