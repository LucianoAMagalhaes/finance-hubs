import { describe, expect, it } from "vitest";
import { apply, monthBornBy } from "./commands";
import type { Command } from "./commands";
import { emptyState } from "./state";
import type { State } from "./state";
import type { IsoDate } from "./month";

const TODAY = "2026-09-18" as IsoDate;

const FIELDS = { description: "Mercado", jar: "fixed-costs", paymentMethod: "pix", amount: 45_000 } as const;

function stateAfter(...commands: Command[]): State {
  return commands.reduce((state, command) => {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, emptyState());
}

describe("the month a command makes be born", () => {
  it("a record is born in the month of its own date, not in the one open on the screen", () => {
    expect(monthBornBy({ type: "save-income", income: { ...FIELDS, date: "2026-10-05", source: "salary" } })).toBe("2026-10");
    expect(monthBornBy({ type: "save-expense", expense: { ...FIELDS, date: "2026-10-05", installments: 1 } })).toBe("2026-10");
    expect(monthBornBy({ type: "save-prepayment", prepayment: { expense: 1, date: "2026-11-02", installments: 2, amount: 1000 } })).toBe(
      "2026-11",
    );
  });

  it("an installment purchase is born in the month of the purchase, where its first installment falls", () => {
    expect(monthBornBy({ type: "save-expense", expense: { ...FIELDS, date: "2026-03-20", installments: 12 } })).toBe("2026-03");
  });

  it("a recurring expense is born in its start month, and changes to it in the month they start from", () => {
    expect(monthBornBy({ type: "create-recurring", recurring: { ...FIELDS, date: "2026-07-05" } })).toBe("2026-07");
    expect(monthBornBy({ type: "change-recurring", id: 1, month: "2026-10", period: FIELDS })).toBe("2026-10");
    expect(monthBornBy({ type: "end-recurring", id: 1, month: "2026-12" })).toBe("2026-12");
  });

  it("percentages are born in the month they are stored for", () => {
    expect(monthBornBy({ type: "save-percentages", month: "2027-01", percentages: {} as never })).toBe("2027-01");
  });

  it("a tag and the trash make no month be born: neither belongs to one", () => {
    expect(monthBornBy({ type: "rename-tag", from: "casa", to: "lar", merge: false })).toBeNull();
    expect(monthBornBy({ type: "delete", record: "expense", id: 1 })).toBeNull();
    expect(monthBornBy({ type: "restore", record: "income", id: 1 })).toBeNull();
  });
});

describe("what the answer commits `apply` to", () => {
  it("what is born is exactly what the answer says, and only that", () => {
    const command: Command = { type: "save-expense", expense: { ...FIELDS, date: "2026-10-05", installments: 1 } };

    expect(Object.keys(stateAfter(command).budgets)).toEqual([monthBornBy(command)]);
  });

  it("a refused command makes no month be born, whatever the answer would have been", () => {
    const refused: Command = { type: "save-expense", expense: { ...FIELDS, description: " ", date: "2026-10-05", installments: 1 } };

    expect(monthBornBy(refused)).toBe("2026-10");
    expect(apply(emptyState(), refused, TODAY).ok).toBe(false);
    expect(stateAfter().budgets).toEqual({});
  });

  it("a month already born is left as it is: being born again would undo its percentages", () => {
    const born = stateAfter(
      { type: "save-expense", expense: { ...FIELDS, date: "2026-10-05", installments: 1 } },
      { type: "save-percentages", month: "2026-10", percentages: PERCENTAGES },
    );

    const after = stateAfter(
      { type: "save-expense", expense: { ...FIELDS, date: "2026-10-05", installments: 1 } },
      { type: "save-percentages", month: "2026-10", percentages: PERCENTAGES },
      { type: "save-income", income: { ...FIELDS, date: "2026-10-20", source: "salary" } },
    );

    expect(after.budgets["2026-10"]).toEqual(born.budgets["2026-10"]);
  });

  it("ending a recurring expense in its start month sends it to the trash without touching the budget", () => {
    const created = stateAfter({ type: "create-recurring", recurring: { ...FIELDS, date: "2026-07-05" } });
    const ended = stateAfter(
      { type: "create-recurring", recurring: { ...FIELDS, date: "2026-07-05" } },
      { type: "end-recurring", id: 1, month: "2026-07" },
    );

    expect(ended.expenses[0]!.deletedAt).toBe(TODAY);
    expect(ended.budgets).toEqual(created.budgets);
  });
});

/** Anything other than the default, so that being born again would be visible. */
const PERCENTAGES = {
  "fixed-costs": 20,
  "financial-freedom": 20,
  comfort: 40,
  goals: 10,
  knowledge: 5,
  pleasures: 5,
};
