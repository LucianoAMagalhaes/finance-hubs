import { describe, expect, it } from "vitest";
import {
  prepaymentsOf,
  apply,
  emptyState,
  groups,
  trashItems,
  prepaymentPreview,
  projectMonth,
  allExpenses,
  type PrepaymentToSave,
  type Command,
  type Purchase,
  type IsoDate,
  type Axis,
  type State,
  type ExpenseToSave,
  type Month,
} from "@/domain";

const TODAY: IsoDate = "2026-09-18";

/** A 10× installment purchase of R$ 389,90 starting in January: the 7th installment falls in July. */
const IN_TEN: ExpenseToSave = {
  date: "2026-01-15",
  description: "Notebook",
  jar: "comfort",
  paymentMethod: "credit-card",
  amount: 389_900,
  installments: 10,
};

describe("prepaying installments", () => {
  it("3 installments prepaid in July take 8/10 to 10/10 out of their months and put the amount paid in July", () => {
    const state = withPrepayment(IN_TEN, { date: "2026-07-20", installments: 3, amount: 300_000 });

    expect(amountsByMonth(state, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990, 300_000],
      [],
      [],
      [],
    ]);
    expect(projectMonth(state, "2026-06").occurrences.map((o) => o.amount)).toEqual([38_990]);
  });

  it("the prepayment's occurrence says which installments it took, of how many and of what total", () => {
    const state = withPrepayment(IN_TEN, { date: "2026-07-20", installments: 3, amount: 300_000 });

    const [, prepayment] = projectMonth(state, "2026-07").occurrences;

    expect(prepayment).toMatchObject({
      description: "Notebook",
      date: "2026-07-20",
      amount: 300_000,
      installment: null,
      prepayment: { id: 1, first: 8, last: 10, of: 10, total: 389_900 },
    });
  });

  it("the amount paid is what the person entered, with or without a discount, and need not fit the installments' sum", () => {
    const sum = prepaymentPreview(purchaseOf(save(emptyState(), IN_TEN), 1), { date: "2026-07-20", installments: 3 }, TODAY).cut!.sum;
    expect(sum).toBe(38_990 * 3);

    const expensive = withPrepayment(IN_TEN, { date: "2026-07-20", installments: 3, amount: 500_000 });

    expect(projectMonth(expensive, "2026-07").aggregates.monthExpenses).toBe(38_990 + 500_000);
  });

  it("the prepayment inherits jar, payment method and tag from the installment purchase", () => {
    const state = withPrepayment({ ...IN_TEN, jar: "goals", tag: "casa" }, { date: "2026-07-20", installments: 2, amount: 70_000 });

    expect(projectMonth(state, "2026-07").occurrences.at(-1)).toMatchObject({
      jar: "goals",
      paymentMethod: "credit-card",
      tag: "casa",
    });
  });

  it("the prepayment makes its month's budget be born; the months the installments left are not born", () => {
    const state = withPrepayment(IN_TEN, { date: "2026-07-20", installments: 3, amount: 300_000 });

    expect(projectMonth(state, "2026-07").budget.born).toBe(true);
    for (const month of ["2026-08", "2026-09", "2026-10"] as const) {
      expect(projectMonth(state, month).budget.born, month).toBe(false);
    }
  });
});

describe("the prepayment preview", () => {
  it("in July, 3 installments of a 10× from January: takes 8/10 to 10/10, from August to October, and August has already passed", () => {
    const purchase = purchaseOf(save(emptyState(), IN_TEN), 1);

    expect(prepaymentPreview(purchase, { date: "2026-07-20", installments: 3 }, TODAY)).toEqual({
      max: 3,
      refusal: null,
      cut: {
        first: 8,
        last: 10,
        sum: 38_990 * 3,
        firstMonth: "2026-08",
        lastMonth: "2026-10",
        pastMonths: ["2026-08"],
      },
    });
  });

  it.each([
    ["invalid date", IN_TEN, { date: "2026-02-31", installments: 3 }],
    ["empty date", IN_TEN, { date: "", installments: 3 }],
    ["zero installments", IN_TEN, { date: "2026-07-20", installments: 0 }],
    ["fractional installments", IN_TEN, { date: "2026-07-20", installments: 1.5 }],
    ["an upfront purchase", { ...IN_TEN, installments: 1 }, { date: "2025-12-05", installments: 1 }],
    ["a refund", { ...IN_TEN, amount: -389_900 }, { date: "2026-07-20", installments: 3 }],
    ["more installments than the maximum", IN_TEN, { date: "2026-07-20", installments: 4 }],
    ["nothing after the prepayment month", IN_TEN, { date: "2026-10-05", installments: 1 }],
  ])("%s: the preview refuses with the same sentence as apply, and shows no cut", (_, expense, attempt) => {
    const state = save(emptyState(), expense);
    const rejected = apply(state, prepay({ ...attempt, date: attempt.date as IsoDate, amount: 1_000 }), TODAY);
    if (rejected.ok) throw new Error("apply should reject");

    const preview = prepaymentPreview(purchaseOf(state, 1), attempt, TODAY);

    expect(preview.refusal).toBe(rejected.error);
    expect(preview.cut).toBeNull();
  });

  it("a single installment: the cut starts and ends in the same month, and nothing has passed while today is still July", () => {
    const purchase = purchaseOf(save(emptyState(), IN_TEN), 1);

    expect(prepaymentPreview(purchase, { date: "2026-07-20", installments: 1 }, "2026-07-25").cut).toMatchObject({
      first: 10,
      last: 10,
      firstMonth: "2026-10",
      lastMonth: "2026-10",
      pastMonths: [],
    });
  });

  it("prepaying in January, already in September: seven of the installments leaving fall in months that have passed", () => {
    const purchase = purchaseOf(save(emptyState(), IN_TEN), 1);

    expect(prepaymentPreview(purchase, { date: "2026-01-20", installments: 9 }, TODAY).cut!.pastMonths).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("correcting July's to reach over August's: the preview refuses with the same sentence as apply", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 1, amount: 35_000 }));
    state = applyOk(state, prepay({ date: "2026-08-10", installments: 1, amount: 35_000 }));
    const rejected = apply(state, prepay({ id: 1, date: "2026-07-20", installments: 3, amount: 90_000 }), TODAY);
    if (rejected.ok) throw new Error("apply should reject");

    const preview = prepaymentPreview(purchaseOf(state, 1), { id: 1, date: "2026-07-20", installments: 3 }, TODAY);

    expect(preview).toEqual({ max: 1, refusal: rejected.error, cut: null });
  });

  it("with N above the maximum, the maximum is still stated so the person can correct it", () => {
    const purchase = purchaseOf(save(emptyState(), IN_TEN), 1);

    expect(prepaymentPreview(purchase, { date: "2026-07-20", installments: 4 }, TODAY).max).toBe(3);
    expect(prepaymentPreview(purchase, { date: "2026-07-20", installments: 0 }, TODAY).max).toBe(3);
    expect(prepaymentPreview(purchase, { date: "2026-02-31", installments: 3 }, TODAY).max).toBe(0);
  });
});

describe("how many installments fit in a prepayment", () => {
  it("only installments of months after the prepayment's count: in July, the maximum of a 10× from January is 3", () => {
    const purchase = purchaseOf(save(emptyState(), IN_TEN), 1);

    expect(maxOn(purchase, "2026-07-20")).toBe(3);
    expect(prepaymentPreview(purchase, { date: "2026-07-20", installments: 3 }, TODAY).cut).toMatchObject({ first: 8, last: 10 });
  });

  it("N greater than the maximum is rejected, and the maximum is exactly the largest N accepted", () => {
    const state = save(emptyState(), IN_TEN);
    const max = maxOn(purchaseOf(state, 1), "2026-07-20");

    expect(apply(state, prepay({ date: "2026-07-20", installments: max, amount: 1_000 }), TODAY).ok).toBe(true);
    expect(apply(state, prepay({ date: "2026-07-20", installments: max + 1, amount: 1_000 }), TODAY)).toEqual({
      ok: false,
      error: expect.stringContaining("3"),
    });
    expect(prepaymentPreview(purchaseOf(state, 1), { date: "2026-07-20", installments: max + 1 }, TODAY).cut).toBeNull();
  });

  it("in the month of the last installment, and after it, nothing is left to prepay", () => {
    const state = save(emptyState(), IN_TEN);

    expect(maxOn(purchaseOf(state, 1), "2026-10-05")).toBe(0);
    expect(maxOn(purchaseOf(state, 1), "2026-12-05")).toBe(0);
    expect(apply(state, prepay({ date: "2026-10-05", installments: 1, amount: 1_000 }), TODAY).ok).toBe(false);
  });

  it("before the purchase, every installment is later: the maximum is the whole installment purchase", () => {
    const state = save(emptyState(), IN_TEN);

    expect(maxOn(purchaseOf(state, 1), "2025-12-05")).toBe(10);
  });

  it("an upfront purchase has no installments to prepay, on any date", () => {
    const state = save(emptyState(), { ...IN_TEN, installments: 1 });

    expect(maxOn(purchaseOf(state, 1), "2025-12-05")).toBe(0);
    expect(maxOn(purchaseOf(state, 1), "2026-01-20")).toBe(0);
    expect(apply(state, prepay({ date: "2025-12-05", installments: 1, amount: 100 }), TODAY)).toEqual({
      ok: false,
      error: expect.stringMatching(/à vista/),
    });
  });

  it("a refund in installments is not prepaid: the amount paid is always positive", () => {
    const state = save(emptyState(), { ...IN_TEN, amount: -389_900 });

    expect(apply(state, prepay({ date: "2026-07-20", installments: 3, amount: 300_000 }), TODAY)).toEqual({
      ok: false,
      error: expect.stringMatching(/reembolso/i),
    });
  });

  it.each([
    ["zero amount", { amount: 0 }],
    ["negative amount", { amount: -100 }],
    ["fractional amount", { amount: 10.5 }],
    ["zero installments", { installments: 0 }],
    ["fractional installments", { installments: 1.5 }],
    ["invalid date", { date: "2026-02-31" as IsoDate }],
  ])("%s is rejected", (_, fields) => {
    const state = save(emptyState(), IN_TEN);

    expect(apply(state, prepay({ date: "2026-07-20", installments: 3, amount: 300_000, ...fields }), TODAY).ok).toBe(false);
  });

  it("only a live installment purchase accepts a prepayment", () => {
    let state = save(emptyState(), IN_TEN);

    expect(apply(state, prepay({ expense: 9, date: "2026-07-20", installments: 1, amount: 100 }), TODAY).ok).toBe(false);

    state = applyOk(state, { type: "delete", record: "expense", id: 1 });

    expect(apply(state, prepay({ date: "2026-07-20", installments: 1, amount: 100 }), TODAY).ok).toBe(false);
  });
});

describe("several prepayments on the same installment purchase", () => {
  it("each one cuts the series from the end, in date order, even when entered out of order", () => {
    let state = save(emptyState(), IN_TEN);
    // August's goes in first, but July's is applied before it.
    state = applyOk(state, prepay({ date: "2026-08-10", installments: 1, amount: 35_000 }));
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 1, amount: 36_000 }));

    const { cuts, last } = prepaymentsOf(purchaseOf(state, 1));
    expect(cuts.map((c) => [c.prepayment.date, c.first, c.last])).toEqual([
      ["2026-07-20", 10, 10],
      ["2026-08-10", 9, 9],
    ]);
    expect(last).toBe(8);
    // A month's occurrences come in date order: the installment falls on the 15th, and the prepayments on their own days.
    expect(amountsByMonth(state, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990, 36_000],
      [35_000, 38_990],
      [],
      [],
    ]);
  });

  it("July's prepayment no longer reaches August's installment: August's is left for no one", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 2, amount: 70_000 }));

    // Installments 1 to 8 remain, and none of them falls after August.
    expect(maxOn(purchaseOf(state, 1), "2026-08-10")).toBe(0);
    expect(apply(state, prepay({ date: "2026-08-10", installments: 1, amount: 35_000 }), TODAY)).toEqual({
      ok: false,
      error: expect.stringMatching(/agosto de 2026/),
    });
  });

  it("the second prepayment only reaches what the first one left", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 2, amount: 70_000 }));

    expect(maxOn(purchaseOf(state, 1), "2026-07-25")).toBe(1);
    expect(apply(state, prepay({ date: "2026-07-25", installments: 2, amount: 70_000 }), TODAY).ok).toBe(false);
  });

  it("paying off is prepaying all the remaining ones: no installment is left afterwards", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-04-10", installments: 3, amount: 100_000 }));
    const purchase = purchaseOf(state, 1);

    state = applyOk(state, prepay({ date: "2026-05-10", installments: maxOn(purchase, "2026-05-10"), amount: 90_000 }));

    expect(prepaymentsOf(purchaseOf(state, 1)).last).toBe(5);
    expect(amountsByMonth(state, ["2026-05", "2026-06", "2026-07", "2026-08"])).toEqual([[90_000, 38_990], [], [], []]);
    expect(maxOn(purchaseOf(state, 1), "2026-05-20")).toBe(0);
  });

  it("correcting a prepayment revalidates the whole series: July's cannot grow over August's", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 1, amount: 35_000 }));
    state = applyOk(state, prepay({ date: "2026-08-10", installments: 1, amount: 35_000 }));

    expect(maxOn(purchaseOf(state, 1), "2026-07-20", 1)).toBe(1);
    expect(apply(state, prepay({ id: 1, date: "2026-07-20", installments: 3, amount: 90_000 }), TODAY).ok).toBe(false);

    const corrected = applyOk(state, prepay({ id: 1, date: "2026-07-20", installments: 1, amount: 30_000 }));

    expect(projectMonth(corrected, "2026-07").occurrences.at(-1)!.amount).toBe(30_000);
  });
});

describe("the lock on an installment purchase with a prepayment", () => {
  const ACTIVE: PrepaymentToSave = { expense: 1, date: "2026-07-20", installments: 3, amount: 300_000 };

  it.each([
    ["the total", { amount: 500_000 }],
    ["the date", { date: "2026-02-15" as IsoDate }],
    ["the number of installments", { installments: 12 }],
    ["the form, going back to upfront", { installments: 1 }],
  ])("editing %s is rejected", (_, fields) => {
    const state = withPrepayment(IN_TEN, ACTIVE);

    expect(apply(state, saveExpense({ ...IN_TEN, ...fields, id: 1 }), TODAY)).toEqual({
      ok: false,
      error: expect.stringMatching(/antecipa/i),
    });
  });

  it("description, jar, payment method and tag remain editable, and the prepayment's occurrence follows along", () => {
    const state = withPrepayment(IN_TEN, ACTIVE);

    const moved = applyOk(state, saveExpense({ ...IN_TEN, id: 1, description: "Notebook novo", jar: "goals", tag: "casa" }));

    expect(projectMonth(moved, "2026-07").occurrences.at(-1)).toMatchObject({
      description: "Notebook novo",
      jar: "goals",
      tag: "casa",
      amount: 300_000,
    });
    expect(groups(projectMonth(moved, "2026-07"), "jar").find((g) => g.key === "goals")!.total).toBe(38_990 + 300_000);
  });

  it("once the prepayment is undone, the lock is lifted", () => {
    let state = withPrepayment(IN_TEN, ACTIVE);
    state = applyOk(state, { type: "delete", record: "prepayment", id: 1 });

    expect(apply(state, saveExpense({ ...IN_TEN, id: 1, amount: 500_000 }), TODAY).ok).toBe(true);
  });

  it("an installment purchase without a prepayment remains free", () => {
    const state = save(emptyState(), IN_TEN);

    expect(apply(state, saveExpense({ ...IN_TEN, id: 1, amount: 500_000, installments: 5 }), TODAY).ok).toBe(true);
  });
});

describe("undoing and restoring a prepayment", () => {
  it("undoing sends it to the trash and gives the installments back to their months; restoring goes back to how it was", () => {
    const state = withPrepayment(IN_TEN, { date: "2026-07-20", installments: 3, amount: 300_000 });
    const before = ["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => projectMonth(state, m as Month));

    const undone = applyOk(state, { type: "delete", record: "prepayment", id: 1 });

    expect(amountsByMonth(undone, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990],
      [38_990],
      [38_990],
      [38_990],
    ]);
    expect(trashItems(undone).map((i) => [i.record, i.id])).toEqual([["prepayment", 1]]);

    const restored = applyOk(undone, { type: "restore", record: "prepayment", id: 1 });

    expect(["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => projectMonth(restored, m as Month))).toEqual(before);
    expect(trashItems(restored)).toEqual([]);
  });

  it("restoring is rejected when another prepayment has already taken those installments", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 3, amount: 300_000 }));
    state = applyOk(state, { type: "delete", record: "prepayment", id: 1 });
    state = applyOk(state, prepay({ date: "2026-08-10", installments: 2, amount: 70_000 }));

    const refusal = apply(state, { type: "restore", record: "prepayment", id: 1 }, TODAY);

    expect(refusal.ok).toBe(false);
    expect(prepaymentsOf(purchaseOf(state, 1)).cuts).toHaveLength(1);
  });

  it("restoring is rejected when the installment purchase shrank and the installments no longer exist", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 3, amount: 300_000 }));
    state = applyOk(state, { type: "delete", record: "prepayment", id: 1 });
    state = applyOk(state, saveExpense({ ...IN_TEN, id: 1, installments: 6 }));

    expect(apply(state, { type: "restore", record: "prepayment", id: 1 }, TODAY).ok).toBe(false);
  });

  it("you cannot undo twice, nor restore what is not in the trash", () => {
    let state = withPrepayment(IN_TEN, { date: "2026-07-20", installments: 3, amount: 300_000 });

    expect(apply(state, { type: "restore", record: "prepayment", id: 1 }, TODAY).ok).toBe(false);
    expect(apply(state, { type: "delete", record: "prepayment", id: 9 }, TODAY).ok).toBe(false);

    state = applyOk(state, { type: "delete", record: "prepayment", id: 1 });

    expect(apply(state, { type: "delete", record: "prepayment", id: 1 }, TODAY).ok).toBe(false);
  });

  it("a new prepayment does not reuse the id of one that is in the trash", () => {
    let state = save(emptyState(), IN_TEN);
    state = applyOk(state, prepay({ date: "2026-07-20", installments: 1, amount: 35_000 }));
    state = applyOk(state, { type: "delete", record: "prepayment", id: 1 });

    state = applyOk(state, prepay({ date: "2026-07-20", installments: 1, amount: 35_000 }));

    expect(purchaseOf(state, 1).prepayments.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("deleting an installment purchase with a prepayment", () => {
  it("the prepayments go along to the trash, without becoming a loose item, and come back with it", () => {
    let state = withPrepayment({ ...IN_TEN, tag: "casa" }, { date: "2026-07-20", installments: 3, amount: 300_000 });
    // A live expense alongside, so the month is not zeroed out when the installment purchase leaves.
    state = save(state, { ...IN_TEN, date: "2026-07-03", jar: "goals", amount: 12_000, installments: 1, tag: null });
    const before = projectMonth(state, "2026-07");

    const deleted = applyOk(state, { type: "delete", record: "expense", id: 1 });
    const view = projectMonth(deleted, "2026-07");

    expect(view.occurrences.map((o) => o.amount)).toEqual([12_000]);
    expect(view.aggregates.monthExpenses).toBe(12_000);
    expect(trashItems(deleted).map((i) => [i.record, i.id])).toEqual([["expense", 1]]);
    // Without the installment purchase, the three axes still add up to the month's expenses.
    for (const axis of ["jar", "payment-method", "tag"] as Axis[]) {
      expect(groups(view, axis).reduce((s, g) => s + g.total, 0), axis).toBe(view.aggregates.monthExpenses);
    }

    const restored = applyOk(deleted, { type: "restore", record: "expense", id: 1 });

    expect(projectMonth(restored, "2026-07")).toEqual(before);
  });

  it("a prepayment of an installment purchase in the trash is not restored on its own", () => {
    let state = withPrepayment(IN_TEN, { date: "2026-07-20", installments: 3, amount: 300_000 });
    state = applyOk(state, { type: "delete", record: "prepayment", id: 1 });
    state = applyOk(state, { type: "delete", record: "expense", id: 1 });

    expect(apply(state, { type: "restore", record: "prepayment", id: 1 }, TODAY)).toEqual({
      ok: false,
      error: expect.stringMatching(/lixeira/i),
    });
  });
});

describe("the three axes invariant with a prepayment", () => {
  const AXES: Axis[] = ["jar", "payment-method", "tag"];
  const MONTHS: Month[] = ["2026-01", "2026-04", "2026-07", "2026-08", "2026-10"];

  it("every occurrence, including the prepayment's, falls into one group of each axis", () => {
    let state = withPrepayment({ ...IN_TEN, tag: "casa" }, { date: "2026-07-20", installments: 2, amount: 70_000 });
    // A second installment purchase, in another jar and without a tag, so the axes have more than one group.
    state = save(state, { ...IN_TEN, date: "2026-07-03", jar: "goals", amount: 60_000, installments: 4, tag: null });
    state = applyOk(state, prepay({ expense: 2, date: "2026-08-04", installments: 2, amount: 28_000 }));

    for (const month of MONTHS) {
      const view = projectMonth(state, month);
      expect(view.jars.reduce((s, j) => s + j.total, 0), month).toBe(view.aggregates.monthExpenses);
      for (const axis of AXES) {
        const gs = groups(view, axis);
        expect(gs.reduce((s, g) => s + g.total, 0), `axis ${axis} in ${month}`).toBe(view.aggregates.monthExpenses);
        expect(gs.flatMap((g) => g.occurrences), `axis ${axis} in ${month}`).toHaveLength(view.occurrences.length);
      }
      expect(allExpenses(view).total, month).toBe(view.aggregates.monthExpenses);
    }
  });
});

function amountsByMonth(state: State, months: Month[]): number[][] {
  return months.map((m) => projectMonth(state, m).occurrences.map((o) => o.amount));
}

const purchaseOf = (state: State, id: number): Purchase => state.expenses.find((e) => e.id === id) as Purchase;

/** The "up to N" the preview states for a prepayment on this date; with an id, for correcting an existing one. */
const maxOn = (purchase: Purchase, date: IsoDate, id?: number): number =>
  prepaymentPreview(purchase, { ...(id !== undefined && { id }), date, installments: 1 }, TODAY).max;

function saveExpense(expense: ExpenseToSave): Command {
  return { type: "save-expense", expense };
}

function prepay(fields: Partial<PrepaymentToSave> & { date: IsoDate; installments: number; amount: number }): Command {
  return { type: "save-prepayment", prepayment: { expense: 1, ...fields } };
}

function save(state: State, expense: ExpenseToSave): State {
  return applyOk(state, saveExpense(expense));
}

function withPrepayment(expense: ExpenseToSave, prepayment: Omit<PrepaymentToSave, "expense">): State {
  return applyOk(save(emptyState(), expense), { type: "save-prepayment", prepayment: { expense: 1, ...prepayment } });
}

function applyOk(state: State, command: Command, today: IsoDate = TODAY): State {
  const result = apply(state, command, today);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
