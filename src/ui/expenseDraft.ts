import {
  centsToField,
  isValidDate,
  monthOf,
  periodIn,
  reaisToCents,
  whyTooFewInstallments,
  type Command,
  type Expense,
  type ExpenseShape,
  type IsoDate,
  type Jar,
  type Month,
  type PaymentMethod,
  type PeriodToSave,
  type Purchase,
  type Result,
} from "@/domain";

/**
 * The draft of an expense: what is written in the fields, as the person typed
 * it, together with the expense it corrects and the month it is open in. Only
 * date, description, amount, installments and tag are free text; jar, payment
 * method, shape and refund come from fixed lists and a checkbox.
 */
export type Draft = {
  /** The expense being corrected; null for a new one. */
  expense: Expense | null;
  /** The month open on the screen: a recurring expense changes from it on. */
  month: Month;
  shape: ExpenseShape;
  date: string;
  description: string;
  amount: string;
  installments: string;
  refund: boolean;
  jar: Jar;
  paymentMethod: PaymentMethod;
  tag: string;
};

/**
 * The draft the form opens with: the expense as it stands, or the proposed date
 * and the app's defaults for a new one. A recurring expense opens at the period
 * in force in the open month; before its start month, at the last one.
 */
export function draftFrom(expense: Expense | null, month: Month, proposedDate: IsoDate): Draft {
  const purchase = expense?.kind === "purchase" ? expense : null;
  const recurring = expense?.kind === "recurring" ? expense : null;
  const fields = purchase ?? (recurring && (periodIn(recurring, month) ?? recurring.periods.at(-1)!));
  const inInstallments = purchase !== null && purchase.installments > 1;
  return {
    expense,
    month,
    shape: recurring ? "recurring" : inInstallments ? "installments" : "upfront",
    date: purchase?.date ?? proposedDate,
    description: fields?.description ?? "",
    // Typed positive and stored negative: the sign is the refund checkbox.
    amount: fields ? centsToField(Math.abs(fields.amount)) : "",
    installments: String(inInstallments ? purchase.installments : 2),
    refund: fields ? fields.amount < 0 : false,
    jar: fields?.jar ?? "fixed-costs",
    paymentMethod: fields?.paymentMethod ?? "pix",
    tag: fields?.tag ?? "",
  };
}

/**
 * The command the draft sends and the month it weighs on, or the refusal that
 * keeps it on the screen. Every refusal here is either about reading the typed
 * text or the same one the domain would give; everything else is left for
 * `apply` to say.
 */
export function commandFrom(draft: Draft): Result<{ command: Command; month: Month }> {
  const { expense, month, shape } = draft;
  const cents = reaisToCents(draft.amount);
  if (cents === null || cents === 0) return { ok: false, error: "Informe o valor em reais, como 297,90." };
  const period: PeriodToSave = {
    description: draft.description,
    jar: draft.jar,
    paymentMethod: draft.paymentMethod,
    amount: draft.refund ? -cents : cents,
    // Typed as it came: the domain normalizes it, and blank is untagged.
    tag: draft.tag,
  };

  // A recurring expense is corrected from the open month on, and keeps its own day.
  if (expense?.kind === "recurring") {
    return { ok: true, value: { command: { type: "change-recurring", id: expense.id, month, period }, month } };
  }

  const n = Number(draft.installments);
  const tooFew = shape === "installments" ? whyTooFewInstallments(n) : null;
  if (tooFew) return { ok: false, error: tooFew };
  // The one place the typed date becomes an `IsoDate`.
  if (!isValidDate(draft.date)) return { ok: false, error: "Informe uma data válida." };
  const date = draft.date;

  if (shape === "recurring") {
    return { ok: true, value: { command: { type: "create-recurring", recurring: { ...period, date } }, month: monthOf(date) } };
  }
  const purchase: Purchase | null = expense;
  return {
    ok: true,
    value: {
      command: {
        type: "save-expense",
        expense: { ...(purchase && { id: purchase.id }), ...period, date, installments: shape === "installments" ? n : 1 },
      },
      month: monthOf(date),
    },
  };
}
