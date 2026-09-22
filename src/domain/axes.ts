import type { Cents } from "./money";
import type { Occurrence } from "./expenses";
import { paymentMethodName, PAYMENT_METHODS } from "./payment-methods";
import type { JarGroup, MonthView } from "./projection";
import { distinctTags } from "./tags";

// The three axes belong to the app, not the user (CONTEXT.md). The order is the screen's.
export const AXES = [
  { id: "jar", name: "Pote" },
  { id: "payment-method", name: "Tipo de pagamento" },
  { id: "tag", name: "Tag" },
] as const;

/** A dimension along which the month's occurrences are grouped. */
export type Axis = (typeof AXES)[number]["id"];

export function axisName(axis: Axis): string {
  return AXES.find((a) => a.id === axis)!.name;
}

export type Group = {
  /** The jar, the payment method or the tag; null is the "sem tag" group. */
  key: string | null;
  name: string;
  /** Net sum of the group's occurrences; negative when there are only refunds. */
  total: Cents;
  /** In date order, as in the view. */
  occurrences: Occurrence[];
};

/** Whether this is the jar axis's group, which carries what the jar has: percentage, limit and verdict. */
export const isJarGroup = (group: Group): group is JarGroup => "verdict" in group;

export function groups(view: MonthView, axis: "jar"): JarGroup[];
export function groups(view: MonthView, axis: Axis): Group[];
/**
 * The groups of an axis in the month. Every occurrence falls into exactly one group, so
 * the totals of any axis add up to the month's expenses. Jar shows all six,
 * even empty; payment method and tag only those with occurrences, with "sem tag" last.
 */
export function groups(view: MonthView, axis: Axis): Group[] {
  switch (axis) {
    case "jar":
      // The jar axis's groups are the jars: the projection already split the occurrences into them.
      return view.jars;
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
