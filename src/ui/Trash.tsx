"use client";

import { formatReais, type IsoDate, type TrashItem } from "@/domain";
import { Amount, Refusal } from "./parts";
import { Sheet } from "./Sheet";
import { useAction } from "./useAction";

type Props = {
  items: TrashItem[];
  /** Returns the error, or null if it restored. */
  restore: (item: TrashItem) => Promise<string | null>;
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
                  <span className="trash-description">{item.description}</span>
                  <span className="hint">
                    {item.where.map((segment) => (
                      <span key={segment} className="segment">
                        {segment}
                      </span>
                    ))}
                    <span className="segment">apagado em {shortDate(item.deletedAt)}</span>
                  </span>
                </div>
                <span className="num">
                  {/* An income is money coming in: it shows as a gain, not as an expense that could be a refund. */}
                  {item.record === "income" ? (
                    <span className="val income">+ {formatReais(item.amount)}</span>
                  ) : (
                    <Amount cents={item.amount} />
                  )}
                </span>
                <button type="button" className="btn" disabled={running} onClick={() => run(() => restore(item))}>
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

const shortDate = (date: IsoDate) => `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
