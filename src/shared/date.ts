/** A date, "YYYY-MM-DD". */
export type IsoDate = `${number}-${number}-${number}`;

/** Whether the text is a "YYYY-MM-DD" date that exists in the calendar. */
export function isValidDate(text: string): text is IsoDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [, year, month, day] = m.map(Number) as [number, number, number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDay;
}

/** "10/03/2026", as the person reads a date. */
export const formatDate = (date: IsoDate) => `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
