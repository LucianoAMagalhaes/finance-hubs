import type { IsoDate } from "@/shared";
import { ANBIMA_HOLIDAYS } from "./anbimaHolidays";

const HOLIDAYS = new Set<IsoDate>(ANBIMA_HOLIDAYS);

const DAY_MS = 86_400_000;

/** A business day is Monday to Friday, except the ANBIMA's national holidays. */
export function isBusinessDay(date: IsoDate): boolean {
  // Day 0 of the epoch was a Thursday.
  const weekday = (Date.parse(`${date}T00:00:00Z`) / DAY_MS + 4) % 7;
  return weekday !== 0 && weekday !== 6 && !HOLIDAYS.has(date);
}

/** How many business days come after `from`, up to and including `to`. */
export function businessDaysAfter(from: IsoDate, to: IsoDate): number {
  let count = 0;
  for (let d = Date.parse(`${from}T00:00:00Z`) + DAY_MS; d <= Date.parse(`${to}T00:00:00Z`); d += DAY_MS) {
    if (isBusinessDay(new Date(d).toISOString().slice(0, 10) as IsoDate)) count++;
  }
  return count;
}
