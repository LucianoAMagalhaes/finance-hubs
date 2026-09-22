"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  prepaymentsOf,
  splitIntoInstallments,
  formatReais,
  monthOf,
  monthName,
  jarName,
  paymentMethodName,
  normalizeTag,
  whatItCanBecome,
  whyNoInstallments,
  JARS,
  reaisToCents,
  startOf,
  addMonths,
  PAYMENT_METHODS,
  periodsWithEnd,
  type Command,
  type Purchase,
  type IsoDate,
  type Ending,
  type ExpenseShape,
  type Expense,
  type Month,
  type Jar,
  type Recurring,
  type PaymentMethod,
} from "@/domain";
import { commandFrom, draftFrom, type Draft } from "./expenseDraft";
import { installmentRange, TagPill } from "./parts";

type Props = {
  /** The expense being corrected; null for a new expense. */
  expense: Expense | null;
  /** The month open on the screen: a recurring expense changes or ends from it on. */
  month: Month;
  /** The tags already used, suggested while typing. */
  tags: string[];
  /** The date the form proposes for a new expense. */
  proposedDate: IsoDate;
  /** Sends the command and says which month it weighs on. Returns the validation error, or null if it saved. */
  save: (command: Command, month: Month) => Promise<string | null>;
  /** Sends the purchase being corrected to the trash. Returns the error, or null if it deleted. */
  delete: () => Promise<string | null>;
  /** Ends the recurring expense being corrected from the open month on. Returns the error, or null if it ended. */
  end: () => Promise<string | null>;
  /** Opens the prepayment form for this installment purchase. */
  prepay: () => void;
  close: () => void;
};

const SHAPES: { id: ExpenseShape; name: string }[] = [
  { id: "upfront", name: "À vista" },
  { id: "installments", name: "Parcelado" },
  { id: "recurring", name: "Recorrente" },
];

/**
 * An expense: an upfront or installment purchase, which switch shape between
 * each other even after saved, or a recurring expense, which does not switch
 * shape. The recurring expense is corrected from the open month on. The refund
 * is typed positive and stored negative, in any shape.
 */
export function ExpenseForm({ expense, month, tags, proposedDate, save, delete: remove, end, prepay, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const purchase = expense?.kind === "purchase" ? expense : null;
  const recurring = expense?.kind === "recurring" ? expense : null;
  // What is written in the fields; the draft module knows how to open it and how to close it into a command.
  const [draft, setDraft] = useState<Draft>(() => draftFrom(expense, month, proposedDate));
  const change = (fields: Partial<Draft>) => setDraft((d) => ({ ...d, ...fields }));
  const { shape, date, description, amount, installments, refund, jar, tag } = draft;
  const wasInstallments = purchase !== null && purchase.installments > 1;
  const inInstallments = shape === "installments";
  const noInstallments = whyNoInstallments(draft.paymentMethod);
  const normalizedTag = normalizeTag(tag);
  // The domain says what this expense can still become, with the same refusal it would give on save.
  const canBecome = whatItCanBecome(expense, month);
  // With an active prepayment, date, total and installments are locked (ADR-0005).
  const locked = canBecome.lock !== null;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal <dialog>: the browser handles focus, Esc and the inert backdrop.
  useEffect(() => dialog.current?.showModal(), []);

  // Only "Cartão de Crédito" pays in installments: leaving it turns the purchase back to upfront.
  function changeMethod(paymentMethod: PaymentMethod) {
    const backToUpfront = whyNoInstallments(paymentMethod) !== null && inInstallments;
    change(backToUpfront ? { paymentMethod, shape: "upfront" } : { paymentMethod });
  }

  /** Why the shape cannot be picked; null when it can. The method being edited only weighs on installments. */
  function blocker(s: ExpenseShape): string | null {
    return canBecome.shapes[s] ?? (s === "installments" ? noInstallments : null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const built = commandFrom(draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    await whileSaving(() => save(built.value.command, built.value.month));
  }

  async function whileSaving(action: () => Promise<string | null>) {
    setSaving(true);
    const refusal = await action();
    setSaving(false);
    setError(refusal);
  }

  return (
    <dialog
      ref={dialog}
      className="sheet"
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
      aria-labelledby="expense-title"
    >
      <form onSubmit={submit}>
        <header>
          <h2 id="expense-title">{recurring ? `Recorrente, aberto em ${monthName(month)}` : expense ? "Gasto" : "Novo gasto"}</h2>
          <p className="hint">
            {shape === "recurring"
              ? "Recorrente: o mesmo valor todo mês, sem fim até ser encerrado."
              : inInstallments
                ? "Parcelado: o total se divide entre os meses, a 1ª parcela no mês da compra."
                : "À vista: pesa inteiro no mês da própria data."}
          </p>
        </header>
        <div className="content">
          <div className="shape-picker" role="group" aria-label="Forma do gasto">
            {SHAPES.map((s) => (
              <button
                type="button"
                key={s.id}
                aria-pressed={s.id === shape}
                disabled={blocker(s.id) !== null}
                title={blocker(s.id) ?? undefined}
                onClick={() => change({ shape: s.id })}
              >
                {s.name}
              </button>
            ))}
          </div>
          {wasInstallments && (
            <p className="notice">
              Compra única em {purchase.installments}×. Salvar muda <strong>todas as parcelas</strong>, inclusive as de meses
              passados, e com elas o veredito desses meses.
            </p>
          )}
          {locked && purchase && <Prepayments purchase={purchase} />}
          {recurring && <Periods recurring={recurring} month={month} />}
          {recurring ? (
            <label className="field">
              <span>Dia do mês</span>
              <input disabled value={`todo dia ${recurring.day} · desde ${monthName(startOf(recurring))}`} />
            </label>
          ) : (
            <label className="field">
              <span>
                {shape === "recurring"
                  ? "Primeira ocorrência (o dia se repete todo mês)"
                  : inInstallments
                    ? "Data da compra (a 1ª parcela cai neste mês)"
                    : "Data"}
              </span>
              <input type="date" required disabled={locked} value={date} onChange={(e) => change({ date: e.target.value })} />
            </label>
          )}
          <label className="field">
            <span>Descrição</span>
            <input
              required
              value={description}
              onChange={(e) => change({ description: e.target.value })}
              placeholder="Ex.: Supermercado"
            />
          </label>
          <div className={inInstallments ? "cols-2" : undefined}>
            <label className="field">
              <span>{inInstallments ? "Total da compra (R$)" : "Valor (R$)"}</span>
              <input
                required
                inputMode="decimal"
                disabled={locked}
                className="num"
                value={amount}
                onChange={(e) => change({ amount: e.target.value })}
                placeholder="0,00"
              />
            </label>
            {inInstallments && (
              <label className="field">
                <span>Parcelas</span>
                <input
                  required
                  type="number"
                  min={2}
                  step={1}
                  disabled={locked}
                  className="num"
                  value={installments}
                  onChange={(e) => change({ installments: e.target.value })}
                />
              </label>
            )}
          </div>
          {inInstallments && <InstallmentsPreview draft={draft} />}
          {shape === "recurring" && !recurring && <RecurringPreview date={date} />}
          <label className="check">
            <input type="checkbox" disabled={locked} checked={refund} onChange={(e) => change({ refund: e.target.checked })} />
            <span>
              É reembolso <span className="hint">— dinheiro voltando de um gasto; grava valor negativo neste pote</span>
            </span>
          </label>
          <div className="cols-2">
            <label className="field">
              <span>Pote</span>
              <select value={jar} onChange={(e) => change({ jar: e.target.value as Jar })}>
                {JARS.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                Tipo de pagamento {noInstallments && <span className="hint">— só cartão parcela</span>}
              </span>
              <select value={draft.paymentMethod} onChange={(e) => changeMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>
              Tag <span className="hint">— opcional, no máximo uma</span>
            </span>
            <input list="tags-in-use" value={tag} onChange={(e) => change({ tag: e.target.value })} placeholder="sem tag" />
            <datalist id="tags-in-use">
              {tags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {normalizedTag && normalizedTag !== tag && (
              <span className="hint">
                Grava como <TagPill tag={normalizedTag} />
              </span>
            )}
          </label>
          {canBecome.end && <p className="hint">{whatEndingDoes(canBecome.end, month)}</p>}
          {error && (
            <p className="notice bad" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          {wasInstallments && (
            <button
              type="button"
              className="btn"
              onClick={prepay}
              title="Pagar adiantado as últimas parcelas que ainda sobram, por um valor com desconto"
            >
              Antecipar parcelas
            </button>
          )}
          {purchase && (
            <button
              type="button"
              className="btn delete"
              disabled={saving}
              onClick={() => whileSaving(remove)}
              title={
                wasInstallments
                  ? "A compra inteira vai para a lixeira, com todas as parcelas, e volta intacta"
                  : "Vai para a lixeira, de onde volta intacto"
              }
            >
              {wasInstallments ? `Apagar as ${purchase.installments} parcelas` : "Apagar"}
            </button>
          )}
          {recurring && (
            <button type="button" className="btn delete" disabled={saving} onClick={() => whileSaving(end)}>
              Encerrar a partir de {monthName(month)}
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {recurring ? `Salvar a partir de ${monthName(month)}` : "Salvar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/**
 * The split before saving, by the same rule as the domain: "3× de R$ 333,33
 * (a 1ª de R$ 333,34)", and which months they fall in. With interest, the
 * total is already the amount paid.
 */
function InstallmentsPreview({ draft: { amount, installments, date, refund } }: { draft: Draft }) {
  const cents = reaisToCents(amount);
  const n = Number(installments);
  if (!cents || !Number.isInteger(n) || n < 2 || !date) return null;
  const total = refund ? -cents : cents;
  const { first, rest } = splitIntoInstallments(total, n);
  const firstMonth = monthOf(date as IsoDate);
  return (
    <p className="hint preview num">
      {n}× de {formatReais(rest)}
      {first !== rest && ` (a 1ª de ${formatReais(first)})`} · de {monthName(firstMonth)} a{" "}
      {monthName(addMonths(firstMonth, n - 1))}
    </p>
  );
}

/**
 * The prepayments in force, and what they lock: with one of them alive, the
 * installment purchase's date, total and number of installments do not change
 * (ADR-0005).
 */
function Prepayments({ purchase }: { purchase: Purchase }) {
  const { cuts } = prepaymentsOf(purchase);
  return (
    <>
      <p className="notice">
        Este parcelado tem {cuts.length === 1 ? "uma antecipação" : `${cuts.length} antecipações`}:{" "}
        <strong>data, total e número de parcelas ficam travados</strong>. Desfaça-a na própria ocorrência para mexer neles.
        Descrição, pote, tipo e tag continuam livres, e a antecipação os acompanha.
      </p>
      <div>
        <span className="hint">Antecipações</span>
        <ol className="periods">
          {cuts.map(({ prepayment, first, last }) => (
            <li key={prepayment.id}>
              <span className="num">{monthName(monthOf(prepayment.date))}</span>
              <span>
                parcelas {installmentRange({ first, last })}/{purchase.installments}
              </span>
              <span className="num right">{formatReais(prepayment.amount)}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/**
 * The recurring expense's periods, each with the months it is in force, and
 * the open month's highlighted. It says until when the change made now will
 * hold.
 */
function Periods({ recurring, month }: { recurring: Recurring; month: Month }) {
  const periods = periodsWithEnd(recurring);
  const next = periods.find((p) => p.since > month);
  const start = startOf(recurring);
  return (
    <>
      <p className="notice">
        Mudar vale de <strong>{monthName(month)}</strong> em diante,{" "}
        {next
          ? `até ${monthName(addMonths(next.since, -1))}: em ${monthName(next.since)} já há outra mudança, que continua valendo.`
          : recurring.endedIn
            ? `até ${monthName(addMonths(recurring.endedIn, -1))}, quando ele termina.`
            : "sem fim."}{" "}
        Os meses antes não mudam
        {month !== start && `; para corrigir desde o começo, abra ${monthName(start)}`}.
      </p>
      <div>
        <span className="hint">Vigências</span>
        <ol className="periods">
          {periods.map((p) => (
            <li key={p.since} className={p.since <= month && (p.until === null || month <= p.until) ? "current" : undefined}>
              <span className="num">
                {monthName(p.since)} → {p.until ? monthName(p.until) : "sem fim"}
              </span>
              <span>
                {p.description} · {jarName(p.jar)} · {paymentMethodName(p.paymentMethod)}
                {p.tag && <> · #{p.tag}</>}
              </span>
              <span className="num right">{formatReais(p.amount)}</span>
            </li>
          ))}
          {recurring.endedIn && (
            <li className="end">
              <span className="num">{monthName(recurring.endedIn)}</span>
              <span>encerrado</span>
            </li>
          )}
        </ol>
      </div>
    </>
  );
}

function whatEndingDoes(ending: Ending, month: Month): string {
  if (ending.type === "trash") {
    return "Este é o mês de início: encerrar apaga o recorrente inteiro, que vai para a lixeira, de onde volta intacto.";
  }
  const { discarded } = ending;
  return (
    `Encerrar a partir de ${monthName(month)}: a última ocorrência passa a ser ${monthName(addMonths(month, -1))}.` +
    (discarded === 1 ? " A mudança daqui em diante some de vez." : "") +
    (discarded > 1 ? ` As ${discarded} mudanças daqui em diante somem de vez.` : "")
  );
}

/** On which day and since when the new recurring expense falls. */
function RecurringPreview({ date }: { date: string }) {
  if (!date) return null;
  const day = Number(date.slice(8));
  return (
    <p className="hint preview">
      Todo dia {day}
      {day > 28 && " (no último dia dos meses mais curtos)"}, a partir de {monthName(monthOf(date as IsoDate))}, sem fim.
    </p>
  );
}
