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

/**
 * A moment on the machine's clock, "YYYY-MM-DDTHH:MM:SS", with no time zone:
 * the app runs locally, so the machine's zone is the person's.
 */
export type IsoDateTime = `${IsoDate}T${string}`;

/** Whether the text is a "YYYY-MM-DDTHH:MM:SS" moment of a date that exists. */
export function isValidDateTime(text: string): text is IsoDateTime {
  const m = /^(.{10})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.exec(text);
  return m !== null && isValidDate(m[1]!);
}

/** The moment's date. */
export const dateOf = (moment: IsoDateTime) => moment.slice(0, 10) as IsoDate;

/** "14:32", as the person reads the time of a moment. */
export const formatTime = (moment: IsoDateTime) => moment.slice(11, 16);

/** Minutes, with their fraction, from one moment to a later one, by the clock on the wall. */
export function minutesBetween(from: IsoDateTime, to: IsoDateTime): number {
  const wall = (m: IsoDateTime) => Date.parse(`${m}Z`);
  return (wall(to) - wall(from)) / 60_000;
}
