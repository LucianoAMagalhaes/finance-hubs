import type { IsoDate } from "@/shared";

/** A calendar month, "YYYY-MM". Compares in time order as a string. */
export type Month = `${number}-${number}`;

const NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function parts(month: Month): [year: number, month: number] {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return [year, m];
}

function fromIndex(index: number): Month {
  const year = Math.floor(index / 12);
  const m = index - year * 12 + 1;
  return `${year}-${String(m).padStart(2, "0")}` as Month;
}

/** Months counted from year zero: month arithmetic becomes integer arithmetic. */
function indexOf(month: Month): number {
  const [year, m] = parts(month);
  return year * 12 + (m - 1);
}

export function addMonths(month: Month, n: number): Month {
  return fromIndex(indexOf(month) + n);
}

/** How many months go from `from` to `to`; negative if `to` comes first. */
export function monthsBetween(from: Month, to: Month): number {
  return indexOf(to) - indexOf(from);
}

export function lastDayOfMonth(month: Month): number {
  const [year, m] = parts(month);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7) as Month;
}

/** The same day as the date, in another month; capped at its last day (31 becomes 28 in February). */
export function sameDayIn(date: IsoDate, month: Month): IsoDate {
  return dayIn(Number(date.slice(8)), month);
}

/** The day of the month as a date; capped at its last day (31 becomes 28 in February). */
export function dayIn(day: number, month: Month): IsoDate {
  return `${month}-${String(Math.min(day, lastDayOfMonth(month))).padStart(2, "0")}` as IsoDate;
}

/** Whether the text is a "YYYY-MM" month that exists. */
export function isValidMonth(text: string): text is Month {
  const m = /^\d{4}-(\d{2})$/.exec(text);
  return m !== null && Number(m[1]) >= 1 && Number(m[1]) <= 12;
}

/** The date a form proposes: today in the current month, day 1 in any other month. */
export function proposedDate(month: Month, today: IsoDate): IsoDate {
  return monthOf(today) === month ? today : (`${month}-01` as IsoDate);
}

export function monthName(month: Month): string {
  const [year, m] = parts(month);
  return `${NAMES[m - 1]} de ${year}`;
}
