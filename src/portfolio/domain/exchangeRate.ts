import { isValidDateTime, type IsoDateTime, type Result } from "@/shared";
import type { AssetClass } from "./classes";

/**
 * How many reais one dollar is worth, exact to 4 places like the PTAX, stored
 * as an integer scaled to 4 places: R$ 5,4213 is 54213.
 */
export type ExchangeRate = number;

const SCALE = 10_000;

/** A plain number as the nearest scaled rate. For constants, tests and what a source answers, never for what the person typed. */
export const exchangeRate = (n: number): ExchangeRate => Math.round(n * SCALE);

/** The scaled rate as a plain number, for arithmetic whose result is only rounded on display. */
export const exchangeRateToNumber = (r: ExchangeRate): number => r / SCALE;

const TYPED = /^(\d+)(?:[.,](\d{1,4}))?$/;

/**
 * What the person typed ("5,4213", "5.42", "5") as an exact scaled rate. A
 * rate has no thousands, so a point is always the decimal one. Null when it
 * is not a number we can read, or has more than 4 places.
 */
export function parseExchangeRate(text: string): ExchangeRate | null {
  const m = TYPED.exec(text.replace(/R\$|\s/g, ""));
  if (!m) return null;
  const scaled = Number(m[1]) * SCALE + Number((m[2] ?? "").padEnd(4, "0"));
  return Number.isSafeInteger(scaled) ? scaled : null;
}

/** The scaled rate as the person would type it: "5,4213", "5,42", "5". */
export function exchangeRateToField(r: ExchangeRate): string {
  const whole = Math.trunc(r / SCALE);
  const fraction = String(r % SCALE)
    .padStart(4, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : String(whole);
}

/**
 * The current exchange rate, brought by a source like a quote, with the time
 * it was obtained. Only the last one is kept, and it keeps counting when the
 * source fails.
 */
export type CurrentExchangeRate = { rate: ExchangeRate; at: IsoDateTime };

export type Currency = "BRL" | "USD";

/** The currency comes from the class: dollars in Ações Internacionais, reais in the others. */
export const currencyOf = (assetClass: AssetClass): Currency => (assetClass === "international-stocks" ? "USD" : "BRL");

/** Why the rate cannot be kept, or null if it can; `name` is how the refusal calls it. */
export function checkExchangeRate(rate: unknown, name: string): string | null {
  if (!Number.isSafeInteger(rate)) return `${name} aceita até 4 casas decimais.`;
  if ((rate as number) <= 0) return `${name} tem que ser maior que zero.`;
  return null;
}

/** Checks the current rate a source brought, whole, because it crosses the server's boundary. */
export function checkCurrentExchangeRate(current: CurrentExchangeRate): Result<CurrentExchangeRate> {
  const error = checkExchangeRate(current?.rate, "O câmbio atual");
  if (error) return { ok: false, error };
  if (typeof current.at !== "string" || !isValidDateTime(current.at)) {
    return { ok: false, error: "O câmbio atual precisa da hora em que foi obtido." };
  }
  return { ok: true, value: { rate: current.rate, at: current.at } };
}
