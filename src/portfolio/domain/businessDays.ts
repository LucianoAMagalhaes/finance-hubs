import type { IsoDate } from "@/shared";

/**
 * How many business days come after `from`, up to and including `to`. For
 * now a business day is Monday to Friday, so a holiday counts as one: the
 * ANBIMA calendar arrives with fixed income.
 */
export function businessDaysAfter(from: IsoDate, to: IsoDate): number {
  const day = (d: IsoDate) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  let count = 0;
  for (let d = day(from) + 1; d <= day(to); d++) {
    // Day 0 of the epoch was a Thursday.
    const weekday = (d + 4) % 7;
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}
