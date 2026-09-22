import type { Cents } from "./money";
import type { Occurrence } from "./expenses";
import { paymentMethodName, PAYMENT_METHODS } from "./payment-methods";
import type { MonthView } from "./projection";
import { distinctTags } from "./tags";

/** A dimension along which the month's occurrences are grouped. */
export type Axis = "jar" | "payment-method" | "tag";

export type Group = {
  /** The jar, the payment method or the tag; null is the "sem tag" group. */
  key: string | null;
  name: string;
  /** Net sum of the group's occurrences; negative when there are only refunds. */
  total: Cents;
  /** In date order, as in the view. */
  occurrences: Occurrence[];
};

/**
 * The groups of an axis in the month. Every occurrence falls into exactly one group, so
 * the totals of any axis add up to the month's expenses. Jar shows all six,
 * even empty; payment method and tag only those with occurrences, with "sem tag" last.
 */
export function groups(view: MonthView, axis: Axis): Group[] {
  switch (axis) {
    case "jar":
      return view.jars.map((j) => group(j.id, j.name, view.occurrences.filter((o) => o.jar === j.id)));
    case "payment-method":
      return PAYMENT_METHODS.map((m) =>
        group(m.id, paymentMethodName(m.id), view.occurrences.filter((o) => o.paymentMethod === m.id)),
      ).filter((g) => g.occurrences.length > 0);
    case "tag": {
      const tags = distinctTags(view.occurrences);
      const untagged = view.occurrences.filter((o) => o.tag === null);
      return [
        ...tags.map((t) => group(t, `#${t}`, view.occurrences.filter((o) => o.tag === t))),
        ...(untagged.length > 0 ? [group(null, "sem tag", untagged)] : []),
      ];
    }
  }
}

/** The month's feed: every occurrence, ungrouped. Adds up to the month's expenses. */
export function allExpenses(view: MonthView): Group {
  return group(null, "Todos os gastos do mês", view.occurrences);
}

function group(key: string | null, name: string, occurrences: Occurrence[]): Group {
  return { key, name, total: occurrences.reduce((sum, o) => sum + o.amount, 0), occurrences };
}
