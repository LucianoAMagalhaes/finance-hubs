"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  centsToField,
  formatReais,
  monthOf,
  monthName,
  jarName,
  paymentMethodName,
  prepaymentPreview,
  reaisToCents,
  type Prepayment,
  type Cents,
  type Command,
  type Purchase,
  type PreviewCut,
  type IsoDate,
  type Month,
} from "@/domain";
import { installmentRange, TagPill } from "./parts";

type Props = {
  /** The installment purchase the prepayment belongs to. */
  purchase: Purchase;
  /** The prepayment being reviewed; null for a new one. */
  prepayment: Prepayment | null;
  /** The date the form proposes for a new prepayment. */
  proposedDate: IsoDate;
  /** To warn when a removed installment falls in a month that has already passed. */
  today: IsoDate;
  /** Sends the command. Returns the validation error, or null if it saved. */
  save: (command: Command) => Promise<string | null>;
  /** Sends the prepayment to the trash. Returns the error, or null if it undid it. */
  undo: () => Promise<string | null>;
  close: () => void;
};

/**
 * Prepaying the last installments of an installment purchase, as the card
 * does (ADR-0005): date, how many installments and amount paid. The prepaid
 * installments leave their months and the amount paid becomes an occurrence
 * in the prepayment's month, with the purchase's jar, payment method and tag.
 */
export function PrepaymentForm({ purchase, prepayment, proposedDate, today, save, undo, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState<string>(prepayment?.date ?? proposedDate);
  const [installments, setInstallments] = useState(String(prepayment?.installments ?? 1));
  const [amount, setAmount] = useState(prepayment ? centsToField(prepayment.amount) : "");
  // Until the person touches the amount, it follows the sum of the installments that leave.
  const [amountEdited, setAmountEdited] = useState(prepayment !== null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal <dialog>: the browser handles focus, Esc and the inert backdrop.
  useEffect(() => dialog.current?.showModal(), []);

  const draft = { ...(prepayment && { id: prepayment.id }), date, installments: Number(installments) };
  const { max, refusal, cut } = prepaymentPreview(purchase, draft, today);
  const shownAmount = amountEdited ? amount : cut ? centsToField(cut.sum) : "";

  function changeAmount(next: string) {
    setAmountEdited(true);
    setAmount(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents = reaisToCents(shownAmount);
    if (cents === null || cents <= 0) {
      setError("Informe o valor pago em reais, como 3.899,00.");
      return;
    }
    const command: Command = {
      type: "save-prepayment",
      prepayment: { expense: purchase.id, ...draft, date: date as IsoDate, amount: cents },
    };
    await whileSaving(() => save(command));
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
      aria-labelledby="prepayment-title"
    >
      <form onSubmit={submit}>
        <header>
          <h2 id="prepayment-title">{prepayment ? "Antecipação" : "Antecipar parcelas"}</h2>
          <p className="hint">
            Leva as <strong>últimas</strong> parcelas que ainda sobram, e só as de meses posteriores ao da antecipação.
          </p>
        </header>
        <div className="content">
          <PurchaseCard purchase={purchase} />
          <div className="cols-2">
            <label className="field">
              <span>Data do pagamento</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>
                Parcelas {max > 0 && <span className="hint">— até {max}</span>}
              </span>
              <input
                required
                type="number"
                min={1}
                max={Math.max(max, 1)}
                step={1}
                className="num"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </label>
          </div>
          {refusal && <p className="notice bad">{refusal}</p>}
          {cut && <Preview purchase={purchase} cut={cut} />}
          <label className="field">
            <span>
              Valor pago (R$) <span className="hint">— o que saiu, já com o desconto</span>
            </span>
            <input
              required
              inputMode="decimal"
              className="num"
              value={shownAmount}
              onChange={(e) => changeAmount(e.target.value)}
              placeholder="0,00"
            />
          </label>
          {cut && <Discount sum={cut.sum} paid={reaisToCents(shownAmount)} />}
          {cut && <PastMonthNotice past={cut.pastMonths} />}
          {error && (
            <p className="notice bad" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          {prepayment && (
            <button
              type="button"
              className="btn delete"
              disabled={saving}
              onClick={() => whileSaving(undo)}
              title="A antecipação vai para a lixeira e as parcelas voltam aos seus meses"
            >
              Desfazer
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={saving || refusal !== null}>
            Salvar
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** Which installment purchase the prepayment belongs to, and whom it inherits jar, method and tag from. */
function PurchaseCard({ purchase }: { purchase: Purchase }) {
  return (
    <p className="notice">
      <strong>{purchase.description}</strong> · {purchase.installments}× de {formatReais(purchase.amount)} desde{" "}
      {monthName(monthOf(purchase.date))}. A antecipação entra em {jarName(purchase.jar)}, por {paymentMethodName(purchase.paymentMethod)}{" "}
      <TagPill tag={purchase.tag} />, acompanhando o parcelado quando ele mudar.
    </p>
  );
}

/** Which installments leave, from which months, and how much they added up to. */
function Preview({ purchase, cut }: { purchase: Purchase; cut: PreviewCut }) {
  return (
    <p className="hint preview num">
      Leva as parcelas {installmentRange(cut)}/{purchase.installments} · {monthName(cut.firstMonth)}
      {cut.first !== cut.last && ` a ${monthName(cut.lastMonth)}`} · somam {formatReais(cut.sum)}
    </p>
  );
}

/** How much the prepayment saved, or cost extra, against the sum of the installments. */
function Discount({ sum, paid }: { sum: Cents; paid: Cents | null }) {
  if (paid === null || paid <= 0 || paid === sum) return null;
  const difference = sum - paid;
  return (
    <p className="hint num">
      {difference > 0 ? `Desconto de ${formatReais(difference)}` : `${formatReais(-difference)} a mais que a soma das parcelas`}
    </p>
  );
}

/** The notice that an installment that leaves already weighed on a closed month, whose verdict will change. */
function PastMonthNotice({ past }: { past: Month[] }) {
  if (past.length === 0) return null;
  return (
    <p className="notice">
      {past.length === 1
        ? `Uma das parcelas que saem cai em ${monthName(past[0]!)}, um mês que já passou:`
        : `${past.length} das parcelas que saem caem em meses que já passaram (de ${monthName(past[0]!)} a ${monthName(past.at(-1)!)}):`}{" "}
      o veredito desses meses muda.
    </p>
  );
}
