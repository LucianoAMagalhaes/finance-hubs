import type { Cents, IsoDate } from "@/shared";
import { dayIn, monthsBetween, monthOf, sameDayIn, addMonths, type Month } from "./month";
import type { PaymentMethod } from "./payment-methods";
import type { Jar } from "./jars";

/**
 * An expense (ADR-0003). It is the only thing stored: the occurrence is derived
 * (ADR-0002). The kind doesn't change after it is saved: a purchase doesn't become
 * recurring, nor the other way around.
 */
export type Expense = Purchase | Recurring;

/** The upfront one is a purchase of one installment; the installment purchase, of several. */
export type Purchase = {
  id: number;
  kind: "purchase";
  date: IsoDate;
  description: string;
  jar: Jar;
  paymentMethod: PaymentMethod;
  /** The purchase's total, never the installment. Negative when it is a refund. */
  amount: Cents;
  /** How many installments the total splits into; 1 is upfront. */
  installments: number;
  /** At most one, normalized (see `normalizeTag`); null is untagged. */
  tag: string | null;
  /** The early payments of the last installments, in any order (ADR-0005). */
  prepayments: Prepayment[];
  /** The trash mark: the day it was deleted; null while it is live. */
  deletedAt: IsoDate | null;
};

/**
 * The early payment of the last `installments` still left in the installment purchase,
 * for `amount`, usually at a discount (ADR-0005). Has no jar, payment method or tag:
 * it inherits the installment purchase's and follows them when they change.
 */
export type Prepayment = {
  /** Numbered across all prepayments, of all installment purchases. */
  id: number;
  /** The payment day; its month is the one that gets the occurrence. */
  date: IsoDate;
  /** How many installments it takes, from the last one backwards. */
  installments: number;
  /** The amount paid, always positive. */
  amount: Cents;
  deletedAt: IsoDate | null;
};

/** The prepayment sent to be saved: without id, it is new; with id, it corrects the existing one. */
export type PrepaymentToSave = {
  /** The installment purchase it belongs to. */
  expense: number;
  id?: number;
  date: IsoDate;
  installments: number;
  amount: Cents;
};

/**
 * An amount that repeats every month, with no end until it is ended. The day belongs to the
 * recurring expense and doesn't change; the rest changes through periods.
 */
export type Recurring = {
  id: number;
  kind: "recurring";
  /** The day of the month it falls on; capped at the last day of shorter months. */
  day: number;
  /** In start order, never empty; the first starts in the start month. */
  periods: Period[];
  /** The first month it no longer falls in; null is endless. */
  endedIn: Month | null;
  deletedAt: IsoDate | null;
};

/** A period: what the recurring expense is from `since` until the next period. */
export type Period = {
  since: Month;
  description: string;
  jar: Jar;
  paymentMethod: PaymentMethod;
  /** Never zero; negative when it is a refund. */
  amount: Cents;
  tag: string | null;
};

/** What the person fills in on the purchase form; the id comes from the domain for a new purchase. */
export type NewExpense = Omit<Purchase, "id" | "kind" | "prepayments" | "deletedAt">;

/**
 * The purchase sent to be saved: without id, it is new; with id, it corrects the existing
 * one. The tag comes as the person typed it; the domain normalizes it.
 */
export type ExpenseToSave = Omit<NewExpense, "tag"> & { id?: number; tag?: string | null };

/** A period as the person fills it in: the start month comes from the command, and the tag as typed. */
export type PeriodToSave = Omit<Period, "since" | "tag"> & { tag?: string | null };

/** A new recurring expense: the date of the first occurrence gives the start month and the day. */
export type RecurringToCreate = PeriodToSave & { date: IsoDate };

/** The impact of an expense in a month. Never stored, always derived. */
export type Occurrence = {
  /** The id of the expense it comes from. */
  expense: number;
  date: IsoDate;
  description: string;
  jar: Jar;
  paymentMethod: PaymentMethod;
  tag: string | null;
  amount: Cents;
  /** Which installment it is, out of how many and of what total; null for upfront and recurring. */
  installment: { number: number; of: number; total: Cents } | null;
  /** Since when the recurring expense falls, and since when this month's period applies; null for a purchase. */
  recurring: { since: Month; periodSince: Month } | null;
  /** Which installments it prepaid, out of how many and of what total; null when it is not a prepayment. */
  prepayment: { id: number; first: number; last: number; of: number; total: Cents } | null;
};

/** An expense's occurrences in the month: none, one, or the installment and a prepayment. */
export function occurrencesIn(e: Expense, month: Month): Occurrence[] {
  return e.kind === "purchase" ? purchaseOccurrences(e, month) : recurringOccurrence(e, month);
}

/** The installment that still falls in the month, and the prepayment that was paid in it. */
function purchaseOccurrences(p: Purchase, month: Month): Occurrence[] {
  const { cuts, last } = prepaymentsOf(p);
  return [
    ...installmentIn(p, month, last),
    ...cuts.filter((c) => monthOf(c.prepayment.date) === month).map((c) => prepaymentOccurrence(p, c)),
  ];
}

/**
 * A purchase's installment in the month: installment n falls n − 1 months after the
 * purchase month, on the same day (capped at the month's last day). Upfront is installment 1
 * of 1. The installments after `last` were prepaid and no longer fall.
 */
function installmentIn(p: Purchase, month: Month, last: number): Occurrence[] {
  const number = monthsBetween(monthOf(p.date), month) + 1;
  if (number < 1 || number > last) return [];
  const { first, rest } = splitIntoInstallments(p.amount, p.installments);
  return [
    {
      expense: p.id,
      date: sameDayIn(p.date, month),
      description: p.description,
      jar: p.jar,
      paymentMethod: p.paymentMethod,
      tag: p.tag,
      amount: number === 1 ? first : rest,
      installment: p.installments > 1 ? { number, of: p.installments, total: p.amount } : null,
      recurring: null,
      prepayment: null,
    },
  ];
}

/** The amount paid, in the prepayment's month, with the installment purchase's jar, payment method and tag. */
function prepaymentOccurrence(p: Purchase, { prepayment, first, last }: Cut): Occurrence {
  return {
    expense: p.id,
    date: prepayment.date,
    description: p.description,
    jar: p.jar,
    paymentMethod: p.paymentMethod,
    tag: p.tag,
    amount: prepayment.amount,
    installment: null,
    recurring: null,
    prepayment: { id: prepayment.id, first, last, of: p.installments, total: p.amount },
  };
}

/**
 * The recurring expense's occurrence in the month, in closed form: it only compares months, without
 * walking through them, so a distant month costs the same as the next one (ADR-0002).
 */
function recurringOccurrence(r: Recurring, month: Month): Occurrence[] {
  const p = periodIn(r, month);
  if (!p) return [];
  return [
    {
      expense: r.id,
      date: dayIn(r.day, month),
      description: p.description,
      jar: p.jar,
      paymentMethod: p.paymentMethod,
      tag: p.tag,
      amount: p.amount,
      installment: null,
      recurring: { since: startOf(r), periodSince: p.since },
      prepayment: null,
    },
  ];
}

/** The installments a prepayment takes: the last ones still left when it was applied. */
export type Cut = { prepayment: Prepayment; first: number; last: number };

/**
 * How the live prepayments cut the series, applied in date order: each
 * one takes the last N installments still left, and only those of months after
 * its own (ADR-0005). `last` is the last installment that still falls in its month,
 * and is 0 when the installment purchase is paid off. `rejected` is the first one that didn't fit:
 * the commands prevent it from existing, and the derivation leaves it out.
 */
export function prepaymentsOf(p: Purchase): { cuts: Cut[]; last: number; rejected: Prepayment | null } {
  const purchaseMonth = monthOf(p.date);
  const cuts: Cut[] = [];
  let last = p.installments;
  for (const prepayment of inApplicationOrder(p.prepayments)) {
    // Only installments of months after the prepayment's can be prepaid.
    const firstEligible = Math.max(1, monthsBetween(purchaseMonth, monthOf(prepayment.date)) + 2);
    const available = last - firstEligible + 1;
    if (!Number.isInteger(prepayment.installments) || prepayment.installments < 1 || prepayment.installments > available) {
      return { cuts, last, rejected: prepayment };
    }
    cuts.push({ prepayment, first: last - prepayment.installments + 1, last });
    last -= prepayment.installments;
  }
  return { cuts, last, rejected: null };
}

/** The live ones in date order; on the same day, in the order they were entered. */
function inApplicationOrder(prepayments: Prepayment[]): Prepayment[] {
  return prepayments
    .filter((p) => p.deletedAt === null)
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
}

/**
 * A prepayment being put together: without id, it is new, and goes after all those of the
 * same day — which is what a new id, always greater than the existing ones, would do.
 */
type TrialPrepayment = { id?: number; date: IsoDate; installments: number };

/** The installment purchase with the trial prepayment in its place, and the id it has in the series. */
export function withTrialPrepayment(p: Purchase, trial: TrialPrepayment): { series: Purchase; id: number } {
  const id = trial.id ?? Number.MAX_SAFE_INTEGER;
  const candidate: Prepayment = { id, date: trial.date, installments: trial.installments, amount: 0, deletedAt: null };
  return { series: { ...p, prepayments: [...p.prepayments.filter((x) => x.id !== id), candidate] }, id };
}

/**
 * How many installments fit in this prepayment — the "até 4" of the form. Zero
 * when no installment of a month after its own is left. The one that would
 * disarrange the prepayments of later dates doesn't fit.
 */
export function maxPrepayable(p: Purchase, trial: Omit<TrialPrepayment, "installments">): number {
  // Only an installment purchase is prepaid: an upfront one weighs in full on the month of its own date.
  if (p.installments < 2) return 0;
  for (let installments = p.installments; installments >= 1; installments--) {
    if (prepaymentsOf(withTrialPrepayment(p, { ...trial, installments }).series).rejected === null) return installments;
  }
  return 0;
}

/** Which month installment number `number` falls in: the 1st in the purchase month, the nth n − 1 months later. */
export const installmentMonth = (p: Purchase, number: number): Month => addMonths(monthOf(p.date), number - 1);

/** How much the installments from `first` to `last` add up to, counting the leftover cent in the 1st. */
export function installmentsSum(p: Purchase, first: number, last: number): Cents {
  const split = splitIntoInstallments(p.amount, p.installments);
  return (first === 1 ? split.first : split.rest) + split.rest * (last - first);
}

/** The month of the first occurrence. */
export const startOf = (r: Recurring): Month => r.periods[0]!.since;

/** Whether the recurring expense falls in the month: from the start month until before it ends. */
export const fallsIn = (r: Recurring, month: Month): boolean =>
  month >= startOf(r) && (r.endedIn === null || month < r.endedIn);

/** The period that applies in the month, the one with the latest start up to it; undefined when the recurring expense doesn't fall in it. */
export function periodIn(r: Recurring, month: Month): Period | undefined {
  return fallsIn(r, month) ? r.periods.findLast((p) => p.since <= month) : undefined;
}

/**
 * The periods with the last month each one applies: the month before the next one,
 * or before the ending; null is endless.
 */
export function periodsWithEnd(r: Recurring): (Period & { until: Month | null })[] {
  return r.periods.map((p, i) => {
    const end = r.periods[i + 1]?.since ?? r.endedIn;
    return { ...p, until: end === null ? null : addMonths(end, -1) };
  });
}

/**
 * The total split into n installments: all equal, except the first, which takes the
 * leftover cent, so that they always add up to the total. The sign is
 * preserved: a refund splits the same way. With n = 1, the first is the total.
 */
export function splitIntoInstallments(total: Cents, n: number): { first: Cents; rest: Cents } {
  // `|| 0`: a negative cent in 2× doesn't leave an installment of −0.
  const rest = Math.trunc(total / n) || 0;
  return { first: total - rest * (n - 1), rest };
}
