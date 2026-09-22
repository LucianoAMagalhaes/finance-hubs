import type { Cents } from "./money";
import { isIncomeSource, type IncomeToSave } from "./incomes";
import { findPrepayment, purchases, type State } from "./state";
import {
  prepaymentsOf,
  fallsIn,
  withTrialPrepayment,
  startOf,
  maxPrepayable,
  installmentMonth,
  installmentsSum,
  type Prepayment,
  type PrepaymentToSave,
  type Purchase,
  type Cut,
  type Expense,
  type ExpenseToSave,
  type Recurring,
  type RecurringToCreate,
  type Period,
  type PeriodToSave,
} from "./expenses";
import { isRecordType, live, type RecordType } from "./trash";
import { isValidDate, isValidMonth, monthOf, monthName, type IsoDate, type Month } from "./month";
import { isIncomeMethod, isPaymentMethod, type PaymentMethod } from "./payment-methods";
import { isJar, validatePercentages, type Percentages } from "./jars";
import { wouldInherit } from "./projection";
import { mergeOnRename, normalizeTag, tagsInUse, tagsInHistory } from "./tags";

/**
 * Everything the person can ask for. Each command arrives with the ticket that uses it.
 */
export type Command =
  | { type: "save-income"; income: IncomeToSave }
  | { type: "save-expense"; expense: ExpenseToSave }
  | { type: "save-prepayment"; prepayment: PrepaymentToSave }
  | { type: "create-recurring"; recurring: RecurringToCreate }
  | { type: "change-recurring"; id: number; month: Month; period: PeriodToSave }
  | { type: "end-recurring"; id: number; month: Month }
  | { type: "save-percentages"; month: Month; percentages: Percentages }
  /** Changes a tag's name across the whole history; `merge` confirms joining it to one that already exists. */
  | { type: "rename-tag"; from: string; to: string; merge: boolean }
  | { type: "delete"; record: RecordType; id: number }
  | { type: "restore"; record: RecordType; id: number };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Applies a command and returns the new state or the validation error. Pure:
 * never changes the state it receives, and `today` comes from outside so the domain doesn't read the clock.
 */
export function apply(state: State, command: Command, today: IsoDate): Result<State> {
  switch (command.type) {
    case "save-income":
      return saveIncome(state, command.income);
    case "save-expense":
      return saveExpense(state, command.expense);
    case "save-prepayment":
      return savePrepayment(state, command.prepayment);
    case "create-recurring":
      return createRecurring(state, command.recurring);
    case "change-recurring":
      return changeRecurring(state, command.id, command.month, command.period);
    case "end-recurring":
      return endRecurring(state, command.id, command.month, today);
    case "save-percentages":
      return savePercentages(state, command.month, command.percentages);
    case "rename-tag":
      return renameTag(state, command.from, command.to, command.merge);
    case "delete":
      return setTrashMark(state, command.record, command.id, today);
    case "restore":
      return setTrashMark(state, command.record, command.id, null);
  }
}

/** The three shapes an expense can take on the screen: the purchase splits into upfront and installments. */
export type ExpenseShape = "upfront" | "installments" | "recurring";

/**
 * What a saved expense can still become in the open month, said before the
 * person tries: each reason is the same refusal `apply` would give. `shapes`
 * says why each shape cannot be chosen (null when it can); `lock`,
 * why date, total and installments don't change; `end`, what ending the
 * recurring expense in this month would do. Without an expense, it is a new one: everything free.
 */
export type WhatItCanBecome = {
  shapes: Record<ExpenseShape, string | null>;
  lock: string | null;
  end: Ending | null;
};

const FREE: WhatItCanBecome = { shapes: { upfront: null, installments: null, recurring: null }, lock: null, end: null };

export function whatItCanBecome(expense: Expense | null, month: Month): WhatItCanBecome {
  if (expense?.kind === "recurring") {
    return {
      ...FREE,
      shapes: { upfront: RECURRING_CANNOT_BECOME_PURCHASE, installments: RECURRING_CANNOT_BECOME_PURCHASE, recurring: null },
      end: ending(expense, month),
    };
  }
  if (expense?.kind === "purchase") {
    const lock = locked(expense) ? PREPAYMENT_LOCK : null;
    // Only an installment purchase has prepayments, and going back to upfront would change the installments: the lock holds it in its shape.
    return { shapes: { upfront: lock, installments: null, recurring: PURCHASE_CANNOT_BECOME_RECURRING }, lock, end: null };
  }
  return FREE;
}

/**
 * What a prepayment being put together would take, said before the person saves:
 * `max` is the "até 4" (0 with an invalid date or with nothing to prepay);
 * `refusal`, the same one `apply` would give, among those that depend only on the installment purchase and the
 * prepayment; `cut`, the installments that go away, from which months, and which of them have already
 * passed — null when there is a refusal.
 */
export type PrepaymentPreview = { max: number; refusal: string | null; cut: PreviewCut | null };

/** The cut the prepayment would make, with how much the installments added up to and which months they fell in. */
export type PreviewCut = Omit<Cut, "prepayment"> & { sum: Cents; firstMonth: Month; lastMonth: Month; pastMonths: Month[] };

export function prepaymentPreview(
  purchase: Purchase,
  trial: { id?: number; date: string; installments: number },
  today: IsoDate,
): PrepaymentPreview {
  const date = trial.date as IsoDate;
  // The max survives a wrong N: it is the hint to correct it.
  const max = isValidDate(date) ? maxPrepayable(purchase, { id: trial.id, date }) : 0;
  const invalid = whyInvalid(date, trial.installments) ?? whyCannotPrepay(purchase);
  if (invalid) return { max, refusal: invalid, cut: null };
  const { series, id } = withTrialPrepayment(purchase, { ...trial, date });
  const { cuts, rejected } = prepaymentsOf(series);
  if (rejected) return { max, refusal: didNotFit(series, rejected), cut: null };
  // With nothing rejected, every live prepayment in the series cut — the trial one too.
  const { first, last } = cuts.find((c) => c.prepayment.id === id)!;
  const months = Array.from({ length: last - first + 1 }, (_, i) => installmentMonth(purchase, first + i));
  return {
    max,
    refusal: null,
    cut: {
      first,
      last,
      sum: installmentsSum(purchase, first, last),
      firstMonth: months[0]!,
      lastMonth: months.at(-1)!,
      pastMonths: months.filter((m) => m < monthOf(today)),
    },
  };
}

const RECURRING_CANNOT_BECOME_PURCHASE = "Um recorrente não vira compra: apague e lance de novo.";
const PURCHASE_CANNOT_BECOME_RECURRING = "Uma compra não vira recorrente: apague e lance de novo.";

/**
 * Changes the trash mark: deleting sets it to today; restoring (null)
 * removes it, and the record comes back intact. Neither makes a month be born nor touches
 * a budget: deleting the last thing in a month leaves the percentages stored.
 */
function setTrashMark(state: State, record: RecordType, id: number, deletedAt: IsoDate | null): Result<State> {
  // The command comes from the browser: no field is trusted to its type.
  if (!isRecordType(record)) return { ok: false, error: "Só entrada, lançamento ou antecipação vão para a lixeira." };
  if (record === "prepayment") return setPrepaymentTrashMark(state, id, deletedAt);
  const key = record === "income" ? "incomes" : "expenses";
  const list: { id: number; deletedAt: IsoDate | null }[] = state[key];
  const target = list.find((r) => r.id === id);
  const name = record === "income" ? "Essa entrada" : "Esse lançamento";
  if (!target) return { ok: false, error: `${name} não existe mais.` };
  if (deletedAt !== null && target.deletedAt !== null) return { ok: false, error: `${name} já está na lixeira.` };
  if (deletedAt === null && target.deletedAt === null) return { ok: false, error: `${name} não está na lixeira.` };
  return { ok: true, value: { ...state, [key]: list.map((r) => (r.id === id ? { ...r, deletedAt } : r)) } };
}

/**
 * Stores a month's percentages, making it be born if it hadn't been yet.
 * No other born month changes; the unborn ones start inheriting from this one by the
 * most-recent-earlier-month rule (ADR-0001).
 */
function savePercentages(state: State, month: Month, percentages: Percentages): Result<State> {
  if (typeof month !== "string" || !isValidMonth(month)) return { ok: false, error: "Mês inválido." };
  const error = validatePercentages(percentages);
  if (error) return { ok: false, error };
  return { ok: true, value: { ...state, budgets: { ...state.budgets, [month]: { ...percentages } } } };
}

/**
 * Changes a tag's name across the whole history: in the purchases and in every
 * period, in every month, including what is in the trash — otherwise
 * restoring would resurrect the old name. When the new name already belongs to another tag
 * in use, the two become one, and that merge demands explicit confirmation:
 * after it nothing says which occurrences came from which name. It doesn't make a month
 * be born: the tag belongs to no month.
 */
function renameTag(state: State, from: string, to: string, merge: boolean): Result<State> {
  // The command comes from the browser: no field is trusted to its type.
  if (typeof from !== "string" || typeof to !== "string") return { ok: false, error: "A tag é um texto livre." };
  const old = normalizeTag(from);
  const renamed = normalizeTag(to);
  if (renamed === null) return { ok: false, error: "Informe o nome novo da tag." };
  // A tag exists while some live expense uses it: one that only remains in the
  // trash isn't renamed, and it isn't one a new name merges with.
  const inUse = tagsInUse(state);
  if (old === null || !inUse.includes(old)) return { ok: false, error: "Essa tag não é de nenhum gasto." };
  if (renamed === old) return { ok: false, error: `#${old} já é o nome desta tag.` };
  const merged = mergeOnRename(tagsInHistory(state), old, renamed);
  if (merged !== null && merge !== true) {
    return { ok: false, error: `Já existe a tag #${merged}: confirme a fusão para juntar as duas numa só.` };
  }
  const swap = <T extends { tag: string | null }>(r: T): T => (r.tag === old ? { ...r, tag: renamed } : r);
  const expenses = state.expenses.map((e) => (e.kind === "purchase" ? swap(e) : { ...e, periods: e.periods.map(swap) }));
  return { ok: true, value: { ...state, expenses } };
}

function saveIncome(state: State, data: IncomeToSave): Result<State> {
  const error = validateIncome(data);
  if (error) return { ok: false, error };
  const incomes = writeToList(state.incomes, { ...data, description: data.description.trim() });
  if (!incomes) return { ok: false, error: "Essa entrada não existe mais." };
  return { ok: true, value: ensureBorn({ ...state, incomes }, monthOf(data.date)) };
}

function saveExpense(state: State, data: ExpenseToSave): Result<State> {
  const error = validateExpense(data);
  if (error) return { ok: false, error };
  const previous = state.expenses.find((e) => e.id === data.id);
  if (previous?.kind === "recurring") return { ok: false, error: RECURRING_CANNOT_BECOME_PURCHASE };
  const lockError = prepaymentLock(previous, data);
  if (lockError) return { ok: false, error: lockError };
  const expenses = writeToList<Purchase>(state.expenses as Purchase[], {
    ...data,
    kind: "purchase",
    description: data.description.trim(),
    tag: normalizeTypedTag(data.tag),
    // The prepayments belong to the purchase and stay where they are: this command doesn't touch them.
    prepayments: previous?.prepayments ?? [],
  });
  if (!expenses) return { ok: false, error: "Esse lançamento não existe mais." };
  return { ok: true, value: ensureBorn({ ...state, expenses }, monthOf(data.date)) };
}

/**
 * While there is an active prepayment, date, total and number of installments — and with
 * it the shape — are locked (ADR-0005): correcting them requires undoing the
 * prepayment first. Description, jar, payment method and tag stay editable, and the
 * prepayment's occurrence follows them.
 */
function prepaymentLock(previous: Purchase | undefined, data: ExpenseToSave): string | null {
  if (!previous || !locked(previous)) return null;
  const changed = previous.date !== data.date || previous.amount !== data.amount || previous.installments !== data.installments;
  return changed ? PREPAYMENT_LOCK : null;
}

/**
 * The prepayment outside the trash locks: once undone, it releases the installment purchase. An
 * installment purchase in the trash can't be corrected at all, and that refusal belongs to whoever writes.
 */
const locked = (purchase: Purchase) => purchase.deletedAt === null && live(purchase.prepayments).length > 0;

const PREPAYMENT_LOCK =
  "Este parcelado tem antecipação: desfaça-a antes de mudar a data, o total ou o número de parcelas.";

/** Without id, adds a prepayment; with id, corrects the existing one. */
function savePrepayment(state: State, data: PrepaymentToSave): Result<State> {
  const fields = whyInvalid(data.date, data.installments);
  if (fields) return { ok: false, error: fields };
  if (!Number.isInteger(data.amount) || data.amount <= 0) {
    return { ok: false, error: "A antecipação tem valor pago positivo, em centavos inteiros: é o que saiu, já com o desconto." };
  }
  const target = purchaseToPrepay(state, data.expense);
  if (!target.ok) return target;
  const purchase = target.value;
  if (data.id !== undefined && !live(purchase.prepayments).some((p) => p.id === data.id)) {
    return { ok: false, error: "Essa antecipação não existe mais." };
  }
  const id = data.id ?? nextId(purchases(state).flatMap((p) => p.prepayments));
  const prepayment: Prepayment = { id, date: data.date, installments: data.installments, amount: data.amount, deletedAt: null };
  // In id order, which is how the database returns them: correcting one doesn't change its place.
  const prepayments = [...purchase.prepayments.filter((p) => p.id !== id), prepayment].sort((a, b) => a.id - b.id);
  return withPrepayments(state, purchase, prepayments, monthOf(data.date));
}

/**
 * Undoing sends the prepayment to the trash, and the installments go back to their
 * months. Restoring revalidates against the installment purchase as it is and refuses if the
 * installments no longer fit (ADR-0005). Neither makes a month be born.
 */
function setPrepaymentTrashMark(state: State, id: number, deletedAt: IsoDate | null): Result<State> {
  const found = findPrepayment(state, id);
  if (!found) return { ok: false, error: "Essa antecipação não existe mais." };
  const { purchase, prepayment: target } = found;
  if (deletedAt !== null && target.deletedAt !== null) return { ok: false, error: "Essa antecipação já está na lixeira." };
  if (deletedAt === null && target.deletedAt === null) return { ok: false, error: "Essa antecipação não está na lixeira." };
  if (deletedAt === null && purchase.deletedAt !== null) {
    return { ok: false, error: "O parcelado desta antecipação está na lixeira: restaure-o antes." };
  }
  const prepayments = purchase.prepayments.map((p) => (p.id === id ? { ...p, deletedAt } : p));
  return withPrepayments(state, purchase, prepayments, null);
}

/**
 * Replaces an installment purchase's prepayments, refusing the one that doesn't fit in the series.
 * `month` is the one that is born; null when none is born.
 */
function withPrepayments(state: State, purchase: Purchase, prepayments: Prepayment[], month: Month | null): Result<State> {
  const updated: Purchase = { ...purchase, prepayments };
  const { rejected } = prepaymentsOf(updated);
  if (rejected) return { ok: false, error: didNotFit(updated, rejected) };
  const expenses = state.expenses.map((e) => (e.id === updated.id ? updated : e));
  const replaced = { ...state, expenses };
  return { ok: true, value: month === null ? replaced : ensureBorn(replaced, month) };
}

/** Why the prepayment didn't fit, stated with the max it would reach today. */
function didNotFit(purchase: Purchase, rejected: Prepayment): string {
  const month = monthName(monthOf(rejected.date));
  const max = maxPrepayable(purchase, { date: rejected.date, id: rejected.id });
  if (max === 0) return `Nenhuma parcela deste parcelado cai depois de ${month}: não há o que antecipar.`;
  const fit = max === 1 ? "1 parcela" : `${max} parcelas`;
  return `Em ${month} este parcelado antecipa no máximo ${fit}.`;
}

/** The live installment purchase that gets the prepayment. */
function purchaseToPrepay(state: State, id: number): Result<Purchase> {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return { ok: false, error: "Esse lançamento não existe mais." };
  if (e.kind !== "purchase") return { ok: false, error: "Um recorrente não tem parcelas para antecipar." };
  if (e.deletedAt !== null) return { ok: false, error: "Esse gasto está na lixeira: restaure-o antes." };
  const error = whyCannotPrepay(e);
  return error ? { ok: false, error } : { ok: true, value: e };
}

/** Why the purchase doesn't accept a prepayment; null for an installment purchase with a positive amount. */
function whyCannotPrepay(p: Purchase): string | null {
  if (p.installments < 2) return "Um gasto à vista não tem parcelas para antecipar.";
  if (p.amount < 0) return "Um reembolso não se antecipa: o valor pago de uma antecipação é positivo.";
  return null;
}

/** Why a prepayment's date or number of installments aren't valid, before looking at the series. */
function whyInvalid(date: unknown, installments: unknown): string | null {
  if (typeof date !== "string" || !isValidDate(date)) return "Informe uma data válida.";
  if (!Number.isInteger(installments) || (installments as number) < 1) {
    return "Informe quantas parcelas antecipar, um inteiro de 1 em diante.";
  }
  return null;
}

/** The date of the first occurrence gives the start month and the day, which doesn't change anymore. */
function createRecurring(state: State, data: RecurringToCreate): Result<State> {
  if (typeof data.date !== "string" || !isValidDate(data.date)) return { ok: false, error: "Informe uma data válida." };
  const error = validateFields(data);
  if (error) return { ok: false, error };
  const start = monthOf(data.date);
  const recurring: Recurring = {
    id: nextId(state.expenses),
    kind: "recurring",
    day: Number(data.date.slice(8)),
    periods: [periodFrom(start, data)],
    endedIn: null,
    deletedAt: null,
  };
  return { ok: true, value: ensureBorn({ ...state, expenses: [...state.expenses, recurring] }, start) };
}

/**
 * Changing from a month on applies until the next change: the period that starts
 * in it is replaced, or a new one is born; the following ones stay intact.
 */
function changeRecurring(state: State, id: number, month: Month, data: PeriodToSave): Result<State> {
  const target = recurringInMonth(state, id, month);
  if (!target.ok) return target;
  const error = validateFields(data);
  if (error) return { ok: false, error };
  const r = target.value;
  const periods = [...r.periods.filter((p) => p.since !== month), periodFrom(month, data)].sort((a, b) =>
    a.since < b.since ? -1 : 1,
  );
  return { ok: true, value: ensureBorn(replaceExpense(state, { ...r, periods }), month) };
}

/**
 * Ending in a month makes it the first without an occurrence and discards for good the
 * periods from then on. In the start month nothing is left: the whole recurring expense
 * goes to the trash, from where it comes back as it was.
 */
function endRecurring(state: State, id: number, month: Month, today: IsoDate): Result<State> {
  const target = recurringInMonth(state, id, month);
  if (!target.ok) return target;
  const r = target.value;
  if (ending(r, month).type === "trash") return setTrashMark(state, "expense", id, today);
  const ended = { ...r, periods: remainingPeriods(r, month), endedIn: month };
  return { ok: true, value: ensureBorn(replaceExpense(state, ended), month) };
}

/** What ending a recurring expense in a month does: in the start month, nothing is left and it goes to the trash. */
export type Ending = { type: "trash" } | { type: "end"; discarded: number };

function ending(r: Recurring, month: Month): Ending {
  if (month === startOf(r)) return { type: "trash" };
  return { type: "end", discarded: r.periods.length - remainingPeriods(r, month).length };
}

/** The periods before the ending month; those from then on are gone for good. */
const remainingPeriods = (r: Recurring, month: Month) => r.periods.filter((p) => p.since < month);

/** The live recurring expense being changed or ended, if it falls in the month. */
function recurringInMonth(state: State, id: number, month: Month): Result<Recurring> {
  if (typeof month !== "string" || !isValidMonth(month)) return { ok: false, error: "Mês inválido." };
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return { ok: false, error: "Esse lançamento não existe mais." };
  if (e.kind !== "recurring") return { ok: false, error: PURCHASE_CANNOT_BECOME_RECURRING };
  if (e.deletedAt !== null) return { ok: false, error: "Esse recorrente está na lixeira: restaure-o antes." };
  if (!fallsIn(e, month)) return { ok: false, error: "Esse recorrente não cai neste mês." };
  return { ok: true, value: e };
}

function periodFrom(since: Month, { description, jar, paymentMethod, amount, tag }: PeriodToSave): Period {
  return { since, description: description.trim(), jar, paymentMethod, amount, tag: normalizeTypedTag(tag) };
}

const normalizeTypedTag = (tag: string | null | undefined) => (tag ? normalizeTag(tag) : null);

const replaceExpense = (state: State, updated: Recurring): State => ({
  ...state,
  expenses: state.expenses.map((e) => (e.id === updated.id ? updated : e)),
});

/** The next id, counting those in the trash: a new record never reuses another's. */
const nextId = (list: { id: number }[]) => Math.max(0, ...list.map((r) => r.id)) + 1;

/**
 * Without id, appends with the next id, counting those in the trash; with id, replaces the
 * record that has it. Null when the id no longer exists or is in the trash:
 * correcting requires restoring first.
 */
function writeToList<T extends { id: number; deletedAt: IsoDate | null }>(
  list: T[],
  { id, ...fields }: Omit<T, "id" | "deletedAt"> & { id?: number },
): T[] | null {
  if (id === undefined) return [...list, { id: nextId(list), ...fields, deletedAt: null } as T];
  if (!list.some((r) => r.id === id && r.deletedAt === null)) return null;
  return list.map((r) => (r.id === id ? ({ id, ...fields, deletedAt: null } as T) : r));
}

// The command comes from the browser: no field is trusted to its type.
function validateIncome(i: IncomeToSave): string | null {
  if (typeof i.date !== "string" || !isValidDate(i.date)) return "Informe uma data válida.";
  if (typeof i.description !== "string" || !i.description.trim()) return "Informe uma descrição.";
  if (!isIncomeSource(i.source)) return "Escolha uma fonte.";
  if (!isIncomeMethod(i.paymentMethod)) return "Entrada só aceita Dinheiro, PIX ou Transferência.";
  if (!Number.isInteger(i.amount) || i.amount <= 0) {
    return "Entrada tem valor positivo. Dinheiro de volta de um lançamento é reembolso, no pote de origem.";
  }
  return null;
}

function validateExpense(e: ExpenseToSave): string | null {
  if (typeof e.date !== "string" || !isValidDate(e.date)) return "Informe uma data válida.";
  const error = validateFields(e);
  if (error) return error;
  if (!Number.isInteger(e.installments) || e.installments < 1) return "Informe o número de parcelas, um inteiro de 1 em diante.";
  return e.installments > 1 ? whyNoInstallments(e.paymentMethod) : null;
}

/** Why the payment method doesn't do installments; null for the only one that does. */
export function whyNoInstallments(paymentMethod: PaymentMethod): string | null {
  return paymentMethod === "cartao-de-credito" ? null : "Só Cartão de Crédito parcela.";
}

/** What purchase and period have in common. */
function validateFields(f: PeriodToSave): string | null {
  if (typeof f.description !== "string" || !f.description.trim()) return "Informe uma descrição.";
  if (!isJar(f.jar)) return "Escolha um dos seis potes.";
  if (!isPaymentMethod(f.paymentMethod)) return "Escolha um tipo de pagamento.";
  if (!Number.isInteger(f.amount) || f.amount === 0) return "Informe um valor diferente de zero, em centavos inteiros.";
  if (f.tag !== undefined && f.tag !== null && typeof f.tag !== "string") return "A tag é um texto livre.";
  return null;
}

/**
 * The month is born with the first record dated in it (ADR-0001): it gets the
 * percentages it would inherit. A month already born stays as it is.
 */
function ensureBorn(state: State, month: Month): State {
  if (state.budgets[month]) return state;
  return { ...state, budgets: { ...state.budgets, [month]: { ...wouldInherit(state, month).percentages } } };
}
