import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  type Command,
  type Expense,
  type IsoDate,
  type Purchase,
  type Recurring,
  type State,
} from "@/domain";
import { commandFrom, draftFrom, type Draft } from "./expenseDraft";

const TODAY = "2026-09-15" as IsoDate;
const PROPOSED = "2026-09-15" as IsoDate;

/** The state the commands leave behind; a refused command is a broken test, not a case. */
function stateAfter(...commands: Command[]): State {
  return commands.reduce((state, command) => {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, emptyState());
}

/** Sends the draft's command to the domain: the refusal, or the state it produced. */
function send(draft: Draft, state: State): { error: string | null; state: State } {
  const built = commandFrom(draft);
  if (!built.ok) return { error: built.error, state };
  const result = apply(state, built.value.command, TODAY);
  return result.ok ? { error: null, state: result.value } : { error: result.error, state };
}

const upfront = stateAfter({
  type: "save-expense",
  expense: { date: "2026-09-10", description: "Mercado", jar: "fixed-costs", paymentMethod: "pix", amount: 12345, installments: 1 },
});

const inInstallments = stateAfter({
  type: "save-expense",
  expense: {
    date: "2026-08-03",
    description: "Notebook",
    jar: "knowledge",
    paymentMethod: "credit-card",
    amount: 600000,
    installments: 10,
    tag: "estudo",
  },
});

const recurring = stateAfter(
  {
    type: "create-recurring",
    recurring: { date: "2026-07-05", description: "Aluguel", jar: "fixed-costs", paymentMethod: "transfer", amount: 150000 },
  },
  {
    type: "change-recurring",
    id: 1,
    month: "2026-09",
    period: { description: "Aluguel", jar: "fixed-costs", paymentMethod: "transfer", amount: 165000 },
  },
);

const only = (state: State): Expense => state.expenses[0]!;

describe("opening the draft", () => {
  it("a new expense starts upfront, on the proposed date, with the app's defaults", () => {
    expect(draftFrom(null, "2026-09", PROPOSED)).toEqual<Draft>({
      expense: null,
      month: "2026-09",
      shape: "upfront",
      date: PROPOSED,
      description: "",
      amount: "",
      installments: "2",
      refund: false,
      jar: "fixed-costs",
      paymentMethod: "pix",
      tag: "",
    });
  });

  it("a purchase opens in the shape it was saved in, with the amount as the person would type it", () => {
    expect(draftFrom(only(upfront), "2026-09", PROPOSED)).toMatchObject({
      shape: "upfront",
      date: "2026-09-10",
      description: "Mercado",
      amount: "123,45",
      installments: "2",
      refund: false,
      tag: "",
    });

    expect(draftFrom(only(inInstallments), "2026-08", PROPOSED)).toMatchObject({
      shape: "installments",
      date: "2026-08-03",
      amount: "6000,00",
      installments: "10",
      jar: "knowledge",
      paymentMethod: "credit-card",
      tag: "estudo",
    });
  });

  it("a refund opens positive, with the checkbox on: the sign is the checkbox", () => {
    const refund = stateAfter({
      type: "save-expense",
      expense: { date: "2026-09-04", description: "Estorno", jar: "comfort", paymentMethod: "pix", amount: -5000, installments: 1 },
    });

    expect(draftFrom(only(refund), "2026-09", PROPOSED)).toMatchObject({ amount: "50,00", refund: true });
  });

  it("a recurring expense opens at the period in force in the open month", () => {
    const r = only(recurring);

    expect(draftFrom(r, "2026-08", PROPOSED)).toMatchObject({ shape: "recurring", amount: "1500,00" });
    expect(draftFrom(r, "2026-09", PROPOSED)).toMatchObject({ shape: "recurring", amount: "1650,00" });
  });

  it("before its start month, a recurring expense opens at the last period, because none is in force", () => {
    expect(draftFrom(only(recurring), "2026-05", PROPOSED)).toMatchObject({ amount: "1650,00" });
  });
});

describe("closing the draft into a command", () => {
  it("an upfront expense becomes a purchase of one installment, weighing on the month of its own date", () => {
    const draft: Draft = { ...draftFrom(null, "2026-09", PROPOSED), description: "Padaria", amount: "18,90", date: "2026-10-02" };
    const built = commandFrom(draft);

    expect(built).toEqual({
      ok: true,
      value: {
        command: {
          type: "save-expense",
          expense: {
            date: "2026-10-02",
            description: "Padaria",
            jar: "fixed-costs",
            paymentMethod: "pix",
            amount: 1890,
            installments: 1,
            tag: "",
          },
        },
        month: "2026-10",
      },
    });
    expect(send(draft, emptyState()).error).toBeNull();
  });

  it("an installment purchase carries the typed number, and the domain accepts it", () => {
    const draft: Draft = {
      ...draftFrom(null, "2026-09", PROPOSED),
      shape: "installments",
      paymentMethod: "credit-card",
      description: "Geladeira",
      amount: "3.000,00",
      installments: "6",
    };

    expect(commandFrom(draft)).toMatchObject({
      ok: true,
      value: { command: { expense: { amount: 300000, installments: 6 } }, month: "2026-09" },
    });
    expect(send(draft, emptyState()).error).toBeNull();
  });

  it("the refund checkbox stores a negative amount", () => {
    const draft: Draft = { ...draftFrom(null, "2026-09", PROPOSED), description: "Estorno", amount: "50,00", refund: true };

    expect(commandFrom(draft)).toMatchObject({ ok: true, value: { command: { expense: { amount: -5000 } } } });
  });

  it("correcting a purchase carries its id, so it replaces instead of adding", () => {
    const draft = { ...draftFrom(only(upfront), "2026-09", PROPOSED), amount: "200,00" };

    expect(commandFrom(draft)).toMatchObject({ ok: true, value: { command: { expense: { id: 1 } } } });

    const { error, state } = send(draft, upfront);
    expect(error).toBeNull();
    expect(state.expenses).toHaveLength(1);
    expect((state.expenses[0] as Purchase).amount).toBe(20000);
  });

  it("a new recurring expense becomes create-recurring, weighing on the month of its first occurrence", () => {
    const draft: Draft = {
      ...draftFrom(null, "2026-09", PROPOSED),
      shape: "recurring",
      description: "Streaming",
      amount: "39,90",
      date: "2026-11-08",
    };

    expect(commandFrom(draft)).toMatchObject({
      ok: true,
      value: { command: { type: "create-recurring", recurring: { date: "2026-11-08", amount: 3990 } }, month: "2026-11" },
    });
    expect(send(draft, emptyState()).error).toBeNull();
  });

  it("correcting a recurring expense changes it from the open month on, not from its date", () => {
    const draft = { ...draftFrom(only(recurring), "2026-10", PROPOSED), amount: "1.700,00" };

    expect(commandFrom(draft)).toMatchObject({
      ok: true,
      value: { command: { type: "change-recurring", id: 1, month: "2026-10", period: { amount: 170000 } }, month: "2026-10" },
    });

    const { error, state } = send(draft, recurring);
    expect(error).toBeNull();
    expect((only(state) as Recurring).periods.map((p) => p.since)).toEqual(["2026-07", "2026-09", "2026-10"]);
  });
});

describe("what the draft refuses before the server", () => {
  it.each([
    ["blank", ""],
    ["unreadable", "abc"],
    ["zero", "0,00"],
  ])("a %s amount is refused, reading the field as the person sees it", (_, amount) => {
    const draft: Draft = { ...draftFrom(null, "2026-09", PROPOSED), description: "Algo", amount };

    expect(commandFrom(draft)).toEqual({ ok: false, error: "Informe o valor em reais, como 297,90." });
  });

  it.each([
    ["one installment", "1"],
    ["unreadable", "x"],
  ])("the installments shape with %s is refused: one installment is upfront, another shape", (_, installments) => {
    const draft: Draft = {
      ...draftFrom(null, "2026-09", PROPOSED),
      shape: "installments",
      paymentMethod: "credit-card",
      description: "Algo",
      amount: "100,00",
      installments,
    };

    expect(commandFrom(draft)).toEqual({ ok: false, error: "Parcelado tem 2 parcelas ou mais." });
  });

  it("a date that does not exist is refused here, with the same words the domain would use", () => {
    const draft: Draft = { ...draftFrom(null, "2026-09", PROPOSED), description: "Algo", amount: "10,00", date: "2026-02-30" };

    expect(commandFrom(draft)).toEqual({ ok: false, error: "Informe uma data válida." });
  });

  it("an empty date is refused, and never reaches the command as an IsoDate", () => {
    const draft: Draft = { ...draftFrom(null, "2026-09", PROPOSED), description: "Algo", amount: "10,00", date: "" };

    expect(commandFrom(draft)).toEqual({ ok: false, error: "Informe uma data válida." });
  });
});

describe("what only the domain refuses", () => {
  it("a blank description passes the draft and comes back as the domain's refusal", () => {
    const draft: Draft = { ...draftFrom(null, "2026-09", PROPOSED), description: "   ", amount: "10,00" };

    expect(commandFrom(draft).ok).toBe(true);
    expect(send(draft, emptyState()).error).toBe("Informe uma descrição.");
  });

  it("installments on a payment method that does not split are refused by the domain", () => {
    const draft: Draft = {
      ...draftFrom(null, "2026-09", PROPOSED),
      shape: "installments",
      paymentMethod: "pix",
      description: "Algo",
      amount: "100,00",
      installments: "3",
    };

    expect(send(draft, emptyState()).error).toBe("Só Cartão de Crédito parcela.");
  });

  it("with a prepayment in force, changing the total is refused: the command reaches the lock (ADR-0005)", () => {
    const locked = stateAfter(
      {
        type: "save-expense",
        expense: {
          date: "2026-08-03",
          description: "Notebook",
          jar: "knowledge",
          paymentMethod: "credit-card",
          amount: 600000,
          installments: 10,
        },
      },
      { type: "save-prepayment", prepayment: { expense: 1, date: "2026-09-01", installments: 3, amount: 150000 } },
    );
    const draft = { ...draftFrom(only(locked), "2026-09", PROPOSED), amount: "7.000,00" };

    expect(commandFrom(draft).ok).toBe(true);
    expect(send(draft, locked).error).toBe(
      "Este parcelado tem antecipação: desfaça-a antes de mudar a data, o total ou o número de parcelas.",
    );
  });
});
