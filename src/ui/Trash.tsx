"use client";

import {
  formatReais,
  startOf,
  monthOf,
  incomeSourceName,
  monthName,
  jarName,
  type IsoDate,
  type TrashItem,
  type Expense,
  type RecordType,
} from "@/domain";
import { Amount, Refusal } from "./parts";
import { Sheet } from "./Sheet";
import { useAction } from "./useAction";

type Props = {
  items: TrashItem[];
  /** Returns the error, or null if it restored. */
  restore: (record: RecordType, id: number) => Promise<string | null>;
  close: () => void;
};

/**
 * What was deleted, most recent first. Restoring brings the record back
 * intact and the screen recalculates at once; the trash stays open to restore
 * more than one. Emptying does not exist: nothing is destroyed for good.
 */
export function Trash({ items, restore, close }: Props) {
  const { run, running, refusal } = useAction();

  return (
    <Sheet labelledBy="trash-title" className="trash" close={close}>
      <header>
        <h2 id="trash-title">Lixeira</h2>
        <p className="hint">O que foi apagado não gera receita nem gasto. Restaurar devolve o registro intacto, no mês dele.</p>
      </header>
      <div className="content">
        {items.length === 0 && <p className="empty-trash">Nada na lixeira.</p>}
        {items.length > 0 && (
          <ul className="trash-items">
            {items.map((item) => (
              <li key={`${item.record}-${item.id}`}>
                <div className="trash-text">
                  <span className="trash-description">{descriptionOf(item)}</span>
                  <span className="hint">
                    {whereItLands(item)} · apagado em {shortDate(item.deletedAt)}
                  </span>
                </div>
                <span className="num">{amountOf(item)}</span>
                <button type="button" className="btn" disabled={running} onClick={() => run(() => restore(item.record, item.id))}>
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
        <Refusal refusal={refusal} />
      </div>
      <footer>
        <button type="button" className="btn" onClick={close}>
          Fechar
        </button>
      </footer>
    </Sheet>
  );
}

function descriptionOf(item: TrashItem): string {
  switch (item.record) {
    case "income":
      return item.income.description;
    case "expense":
      return fieldsOf(item.expense).description;
    case "prepayment":
      return item.purchase.description;
  }
}

/** What the expense shows: the purchase, or the recurring expense's last period. */
const fieldsOf = (e: Expense) => (e.kind === "purchase" ? e : e.periods.at(-1)!);

/** Which record it is, and which month it weighs on when it comes back. */
function whereItLands(item: TrashItem): string {
  if (item.record === "income") {
    const i = item.income;
    return `Entrada · ${incomeSourceName(i.source)} · ${monthName(monthOf(i.date))}`;
  }
  if (item.record === "prepayment") {
    const p = item.prepayment;
    const howMany = p.installments === 1 ? "1 parcela" : `${p.installments} parcelas`;
    return `Antecipação de ${howMany} · ${monthName(monthOf(p.date))} · volta a cortar as últimas que sobrarem`;
  }
  const e = item.expense;
  const shape =
    e.kind === "recurring"
      ? `recorrente desde ${monthName(startOf(e))}${e.endedIn ? `, encerrado em ${monthName(e.endedIn)}` : ""}`
      : e.installments > 1
        ? `${e.installments}× a partir de ${monthName(monthOf(e.date))}`
        : monthName(monthOf(e.date));
  return `Gasto · ${jarName(fieldsOf(e).jar)} · ${shape}`;
}

function amountOf(item: TrashItem) {
  if (item.record === "income") return <span className="val income">+ {formatReais(item.income.amount)}</span>;
  if (item.record === "prepayment") return <Amount cents={item.prepayment.amount} />;
  return <Amount cents={fieldsOf(item.expense).amount} />;
}

const shortDate = (date: IsoDate) => `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
