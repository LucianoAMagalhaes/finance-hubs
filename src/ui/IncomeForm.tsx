"use client";

import { useState, type FormEvent } from "react";
import {
  centsToField,
  INCOME_SOURCES,
  reaisToCents,
  INCOME_METHODS,
  type IsoDate,
  type Income,
  type IncomeToSave,
  type IncomeSource,
  type IncomeMethod,
} from "@/domain";
import { Refusal } from "./parts";
import { Sheet } from "./Sheet";
import { useAction } from "./useAction";

type Props = {
  /** The income being corrected; null for a new income. */
  income: Income | null;
  /** The date the form proposes for a new income. */
  proposedDate: IsoDate;
  /** Returns the validation error, or null if it saved. */
  save: (income: IncomeToSave) => Promise<string | null>;
  /** Sends the income being corrected to the trash. Returns the error, or null if it deleted. */
  delete: () => Promise<string | null>;
  close: () => void;
};

export function IncomeForm({ income, proposedDate, save, delete: remove, close }: Props) {
  const [date, setDate] = useState<string>(income?.date ?? proposedDate);
  const [description, setDescription] = useState(income?.description ?? "");
  const [amount, setAmount] = useState(income ? centsToField(income.amount) : "");
  const [source, setSource] = useState<IncomeSource>(income?.source ?? "salary");
  const [method, setMethod] = useState<IncomeMethod>(income?.paymentMethod ?? "transfer");
  const { run, running, refusal, refuse } = useAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents = reaisToCents(amount);
    if (cents === null) {
      refuse("Informe o valor em reais, como 7.200,00.");
      return;
    }
    await run(() =>
      save({
        ...(income && { id: income.id }),
        date: date as IsoDate,
        description,
        source,
        paymentMethod: method,
        amount: cents,
      }),
    );
  }

  return (
    <Sheet labelledBy="income-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="income-title">{income ? "Entrada" : "Nova entrada"}</h2>
          <p className="hint">Dinheiro entrando. Sem pote, sem parcela, sem repetição: pesa só no mês da própria data.</p>
        </header>
        <div className="content">
          <label className="field">
            <span>Data</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Descrição</span>
            <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Salário de setembro" />
          </label>
          <div className="cols-2">
            <label className="field">
              <span>Valor (R$)</span>
              <input
                required
                inputMode="decimal"
                className="num"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="field">
              <span>Fonte</span>
              <select value={source} onChange={(e) => setSource(e.target.value as IncomeSource)}>
                {INCOME_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>
              Tipo de pagamento <span className="hint">(só os três que creditam)</span>
            </span>
            <select value={method} onChange={(e) => setMethod(e.target.value as IncomeMethod)}>
              {INCOME_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          {income && (
            <button type="button" className="btn delete" disabled={running} onClick={() => run(remove)} title="Vai para a lixeira, de onde volta intacta">
              Apagar
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn income" disabled={running}>
            Salvar
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
