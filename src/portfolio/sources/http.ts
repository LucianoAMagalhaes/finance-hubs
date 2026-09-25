import { decimal, type Decimal } from "@/portfolio/domain";
import { SourceError } from "./port";

/** How long a source may take before it counts as down. */
const TIMEOUT_MS = 10_000;

/**
 * GETs the JSON a source answers; an empty body is null. A network failure, a
 * timeout, a status other than 2xx or the ones in `accept`, or a body that
 * isn't JSON is a SourceError.
 */
export async function getJson(
  url: string,
  fetchFn: typeof fetch,
  headers: Record<string, string> = {},
  accept: number[] = [],
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    throw new SourceError(`${url} didn't answer: ${String(error)}`);
  }
  if (!response.ok && !accept.includes(response.status)) throw new SourceError(`${url} answered ${response.status}.`);
  try {
    const body = await response.text();
    return body.trim() === "" ? null : JSON.parse(body);
  } catch {
    throw new SourceError(`${url} didn't answer JSON.`);
  }
}

/**
 * Reads the source's number as an exact decimal of 8 places. Anything else,
 * or a price that rounds to nothing, is a format failure.
 */
export function priceFrom(value: unknown, where: string): Decimal {
  const price = typeof value === "number" && Number.isFinite(value) ? decimal(value) : 0;
  if (price <= 0) throw new SourceError(`${where}: no price in the answer.`);
  return price;
}
