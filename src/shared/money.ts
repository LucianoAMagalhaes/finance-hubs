/** Money always in whole cents, so sums never go wrong through floating point. */
export type Cents = number;

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const WITH_COMMA = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/;
const DECIMAL_POINT = /^(\d+)(?:\.(\d{1,2}))?$/;
const THOUSANDS_POINT = /^\d{1,3}(?:\.\d{3})+$/;

/**
 * Typed reais ("7.200,00", "7200,5", "1234.56") as whole cents, without going
 * through floating point. Null when the text is not an amount we know how to read.
 */
export function reaisToCents(text: string): Cents | null {
  const t = text.replace(/R\$/g, "").replace(/\s/g, "");
  let whole: string;
  let fraction = "";
  const c = WITH_COMMA.exec(t);
  const p = DECIMAL_POINT.exec(t);
  if (c) [whole, fraction] = [c[1]!, c[2]!];
  else if (p) [whole, fraction] = [p[1]!, p[2] ?? ""];
  else if (THOUSANDS_POINT.test(t)) whole = t;
  else return null;
  return Number(whole.replace(/\./g, "")) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Cents in the format a person would type into a field: "7200,00". */
export function centsToField(cents: Cents): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * "R$ 1.234,56", or "− R$ 297,90" when negative. Accepts a fraction of a cent
 * (an exact limit) and only rounds here, for display.
 */
export function formatReais(value: number): string {
  const cents = Math.round(Math.abs(value));
  const text = BRL.format(cents / 100);
  return value < 0 && cents > 0 ? `− ${text}` : text;
}
