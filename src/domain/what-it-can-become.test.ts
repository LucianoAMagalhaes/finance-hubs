import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  whatItCanBecome,
  whyNoInstallments,
  type Command,
  type IsoDate,
  type State,
  type Expense,
  type ExpenseToSave,
  type Month,
  type RecurringToCreate,
} from "@/domain";

const TODAY: IsoDate = "2026-09-18";

// Each case checks both sides: what the query says is locked, `apply`
// rejects with the same sentence; what it says is free, `apply` accepts.

describe("what an expense can become", () => {
  it("a new expense can take any form, with everything free and nothing to end", () => {
    expect(whatItCanBecome(null, "2026-09")).toEqual({
      shapes: { upfront: null, installments: null, recurring: null },
      lock: null,
      end: null,
    });
    expect(accepts(emptyState(), saveExpense(PURCHASE))).toBe(true);
    expect(accepts(emptyState(), saveExpense({ ...PURCHASE, installments: 3 }))).toBe(true);
    expect(accepts(emptyState(), { type: "create-recurring", recurring: RENT })).toBe(true);
  });

  it("a recurring does not become a purchase, with the same refusal saving it as a purchase would give", () => {
    const state = after({ type: "create-recurring", recurring: RENT });

    const { shapes, lock } = whatItCanBecome(expenseOf(state), "2026-07");

    expect(shapes.upfront).toBe("Um recorrente não vira compra: apague e lance de novo.");
    expect(refusal(state, saveExpense({ ...PURCHASE, id: 1 }))).toBe(shapes.upfront);
    expect(refusal(state, saveExpense({ ...PURCHASE, id: 1, installments: 3 }))).toBe(shapes.installments);
    expect(shapes.recurring).toBeNull();
    expect(lock).toBeNull();
    expect(accepts(state, { type: "change-recurring", id: 1, month: "2026-07", period: { ...RENT, amount: 160_000 } })).toBe(true);
  });

  it("an upfront purchase becomes installments and back, but does not become a recurring", () => {
    const state = after(saveExpense(PURCHASE));

    const { shapes, lock } = whatItCanBecome(expenseOf(state), "2026-07");

    expect(shapes.upfront).toBeNull();
    expect(shapes.installments).toBeNull();
    expect(lock).toBeNull();
    expect(accepts(state, saveExpense({ ...PURCHASE, id: 1, installments: 3 }))).toBe(true);
    expect(shapes.recurring).toBe("Uma compra não vira recorrente: apague e lance de novo.");
    expect(refusal(state, { type: "change-recurring", id: 1, month: "2026-07", period: PURCHASE })).toBe(shapes.recurring);
  });

  it("an installment purchase without a prepayment changes date, total and installments, and goes back to upfront", () => {
    const state = after(saveExpense(IN_TEN));

    const { shapes, lock } = whatItCanBecome(expenseOf(state), "2026-07");

    expect(lock).toBeNull();
    expect(shapes.upfront).toBeNull();
    expect(accepts(state, saveExpense({ ...IN_TEN, id: 1, date: "2026-02-15", amount: 400_000, installments: 12 }))).toBe(true);
    expect(accepts(state, saveExpense({ ...IN_TEN, id: 1, installments: 1 }))).toBe(true);
  });

  describe("an installment purchase with a prepayment", () => {
    const state = after(saveExpense(IN_TEN), PREPAY_3_IN_JULY);
    const { shapes, lock } = whatItCanBecome(expenseOf(state), "2026-07");
    const corrected = { ...IN_TEN, id: 1 };

    it("locks date, total and installments with the same refusal changing them would give", () => {
      expect(lock).toBe("Este parcelado tem antecipação: desfaça-a antes de mudar a data, o total ou o número de parcelas.");
      expect(refusal(state, saveExpense({ ...corrected, date: "2026-02-15" }))).toBe(lock);
      expect(refusal(state, saveExpense({ ...corrected, amount: 400_000 }))).toBe(lock);
      expect(refusal(state, saveExpense({ ...corrected, installments: 12 }))).toBe(lock);
    });

    it("stays free for description, jar and tag", () => {
      expect(accepts(state, saveExpense({ ...corrected, description: "Notebook novo", jar: "goals", tag: "trabalho" }))).toBe(true);
    });

    it("does not go back to upfront, because of the same lock", () => {
      expect(shapes.installments).toBeNull();
      expect(shapes.upfront).toBe(lock);
      expect(refusal(state, saveExpense({ ...corrected, installments: 1 }))).toBe(lock);
    });

    it("does not become a recurring because it is a purchase, which is the reason that beats the lock", () => {
      expect(shapes.recurring).toBe("Uma compra não vira recorrente: apague e lance de novo.");
      expect(refusal(state, { type: "change-recurring", id: 1, month: "2026-07", period: IN_TEN })).toBe(shapes.recurring);
    });
  });

  it("an installment purchase whose prepayment was undone becomes free again", () => {
    const state = after(saveExpense(IN_TEN), PREPAY_3_IN_JULY, { type: "delete", record: "prepayment", id: 1 });

    const { shapes, lock } = whatItCanBecome(expenseOf(state), "2026-07");

    expect(lock).toBeNull();
    expect(shapes.upfront).toBeNull();
    expect(accepts(state, saveExpense({ ...IN_TEN, id: 1, date: "2026-02-15", amount: 400_000 }))).toBe(true);
    expect(accepts(state, saveExpense({ ...IN_TEN, id: 1, installments: 1 }))).toBe(true);
  });

  it("an installment purchase in the trash does not report itself locked by the prepayment: the refusal is the saver's", () => {
    const state = after(saveExpense(IN_TEN), PREPAY_3_IN_JULY, { type: "delete", record: "expense", id: 1 });

    expect(whatItCanBecome(expenseOf(state), "2026-07").lock).toBeNull();
    expect(refusal(state, saveExpense({ ...IN_TEN, id: 1, installments: 12 }))).toBe("Esse lançamento não existe mais.");
  });
});

describe("only Credit Card splits into installments", () => {
  it("off the card, the refusal is the same saving the installment purchase would give", () => {
    expect(whyNoInstallments("pix")).toBe("Só Cartão de Crédito parcela.");
    expect(refusal(emptyState(), saveExpense({ ...PURCHASE, paymentMethod: "pix", installments: 3 }))).toBe(whyNoInstallments("pix"));
  });

  it("on the card, it splits into installments", () => {
    expect(whyNoInstallments("credit-card")).toBeNull();
  });
});

describe("ending a recurring", () => {
  // Rent since June, adjusted in August: two periods.
  const state = after(
    { type: "create-recurring", recurring: RENT },
    { type: "change-recurring", id: 1, month: "2026-08", period: { ...RENT, amount: 165_000 } },
  );
  const rent = expenseOf(state);
  const ended = (month: Month) => expenseOf(applyOk(state, { type: "end-recurring", id: 1, month }));

  it("in the start month it sends the whole recurring to the trash", () => {
    expect(whatItCanBecome(rent, "2026-06").end).toEqual({ type: "trash" });
    expect(ended("2026-06").deletedAt).toBe(TODAY);
  });

  it("before the adjustment it discards the period that came after", () => {
    expect(whatItCanBecome(rent, "2026-07").end).toEqual({ type: "end", discarded: 1 });
    expect(ended("2026-07")).toMatchObject({ deletedAt: null, endedIn: "2026-07", periods: [{ since: "2026-06" }] });
  });

  it("after the adjustment it discards none", () => {
    expect(whatItCanBecome(rent, "2026-09").end).toEqual({ type: "end", discarded: 0 });
    expect(ended("2026-09")).toMatchObject({ periods: [{ since: "2026-06" }, { since: "2026-08" }] });
  });

  it("a purchase has nothing to end", () => {
    expect(whatItCanBecome(expenseOf(after(saveExpense(PURCHASE))), "2026-07").end).toBeNull();
  });
});

const PURCHASE: ExpenseToSave = {
  date: "2026-07-10",
  description: "Supermercado",
  jar: "fixed-costs",
  paymentMethod: "credit-card",
  amount: 30_000,
  installments: 1,
};

/** A 10× installment purchase starting in January. */
const IN_TEN: ExpenseToSave = {
  date: "2026-01-15",
  description: "Notebook",
  jar: "comfort",
  paymentMethod: "credit-card",
  amount: 389_900,
  installments: 10,
};

/** The last 3 installments of installment purchase 1, prepaid in July. */
const PREPAY_3_IN_JULY: Command = {
  type: "save-prepayment",
  prepayment: { expense: 1, date: "2026-07-20", installments: 3, amount: 300_000 },
};

/** A recurring rent since June, with a single period. */
const RENT: RecurringToCreate = { date: "2026-06-05", description: "Aluguel", jar: "fixed-costs", paymentMethod: "pix", amount: 150_000 };

const saveExpense = (expense: ExpenseToSave): Command => ({ type: "save-expense", expense });

const accepts = (state: State, command: Command) => apply(state, command, TODAY).ok;

/** A command's refusal, failing the test if it goes through. */
function refusal(state: State, command: Command): string {
  const result = apply(state, command, TODAY);
  if (result.ok) throw new Error(`the command ${command.type} went through`);
  return result.error;
}

/** The state after the commands, in order, starting from empty. */
const after = (...commands: Command[]): State => commands.reduce(applyOk, emptyState());

function applyOk(state: State, command: Command): State {
  const result = apply(state, command, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function expenseOf(state: State, id = 1): Expense {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) throw new Error(`${id} does not exist`);
  return e;
}
