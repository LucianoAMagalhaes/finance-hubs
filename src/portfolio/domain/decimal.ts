/**
 * An exact decimal, stored as an integer scaled to 8 places: 0,00321 BTC is
 * 321000. Quantities and unit prices are kept like this, because crypto has
 * tiny fractions and prices below a cent, and floating point would drift.
 */
export type Decimal = number;

export const DECIMAL_PLACES = 8;
const SCALE = 10 ** DECIMAL_PLACES;

/** A plain number as the nearest scaled decimal. For constants and tests, never for what the person typed. */
export const decimal = (n: number): Decimal => Math.round(n * SCALE);

/** The scaled decimal as a plain number, for arithmetic whose result is only rounded on display. */
export const decimalToNumber = (d: Decimal): number => d / SCALE;

const WITH_COMMA = /^([1-9]\d{0,2}(?:\.\d{3})+|\d+),(\d+)$/;
const WITH_POINT = /^(\d+)(?:\.(\d+))?$/;
const THOUSANDS_POINT = /^[1-9]\d{0,2}(?:\.\d{3})+$/;

/**
 * What the person typed ("0,00321", "1.234,5", "36.80") as an exact scaled
 * decimal, without going through floating point. A point in groups of three
 * is the thousands', unless the number starts with 0: "0.123" is a
 * fraction. Null when it is not a number we can read, is negative, or has
 * more than 8 places.
 */
export function parseDecimal(text: string): Decimal | null {
  const t = text.replace(/R\$|US\$/g, "").replace(/\s/g, "");
  let whole: string;
  let fraction = "";
  const c = WITH_COMMA.exec(t);
  if (c) [whole, fraction] = [c[1]!.replace(/\./g, ""), c[2]!];
  else if (THOUSANDS_POINT.test(t)) whole = t.replace(/\./g, "");
  else {
    const p = WITH_POINT.exec(t);
    if (!p) return null;
    [whole, fraction] = [p[1]!, p[2] ?? ""];
  }
  if (fraction.length > DECIMAL_PLACES) return null;
  const scaled = Number(whole) * SCALE + Number(fraction.padEnd(DECIMAL_PLACES, "0"));
  return Number.isSafeInteger(scaled) ? scaled : null;
}

/** The scaled decimal as the person would type it: "0,00321", "100", "36,8". */
export function decimalToField(d: Decimal): string {
  const whole = Math.trunc(d / SCALE);
  const fraction = String(d % SCALE)
    .padStart(DECIMAL_PLACES, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : String(whole);
}
