"use client";

import { useState, type FormEvent } from "react";
import {
  CORPORATE_ACTION_KINDS,
  type Asset,
  type CorporateAction,
  type CorporateActionToSave,
  type IsoDate,
  type TradeKind,
} from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { CORPORATE_ACTION_NAMES, LaunchPicker } from "./parts";
import {
  checkCorporateActionDraft,
  corporateActionDraftFrom,
  emptyCorporateActionDraft,
  type CorporateActionDraft,
} from "./corporateActionDraft";

type Props = {
  /** The asset whose row the action opened from, or the one of the action being corrected. */
  asset: Asset;
  /** The action being corrected; null for a new one. */
  action: CorporateAction | null;
  today: IsoDate;
  /** For a new action, turns the sheet back into a trade of that kind; absent when correcting. */
  tradeInstead?: (kind: TradeKind) => void;
  /** Returns the refusal, or null if it saved. */
  save: (action: CorporateActionToSave) => Promise<string | null>;
  /** Deletes the action being corrected for good. Returns the refusal, or null if it deleted. */
  delete: () => Promise<string | null>;
  close: () => void;
};

/**
 * A split, reverse split or bonus typed by hand: the date and the ratio as
 * the company announces it. It multiplies the quantity and keeps the cost. A
 * saved action opens here to have its date, kind and ratio corrected, or to be
 * deleted for good.
 */
export function CorporateActionForm({ asset, action, today, tradeInstead, save, delete: remove, close }: Props) {
  const [draft, setDraft] = useState<CorporateActionDraft>(() =>
    action ? corporateActionDraftFrom(action) : emptyCorporateActionDraft(today, asset.id),
  );
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const edit = (change: Partial<CorporateActionDraft>) => {
    clearRefusal();
    setDraft((d) => ({ ...d, ...change }));
  };
  const bonus = draft.kind === "bonus";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkCorporateActionDraft(draft);
    if (checked.error) {
      refuse(checked.error);
      return;
    }
    await run(() => save(checked.action));
  }

  return (
    <Sheet labelledBy="corporate-action-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="corporate-action-title">{action ? "Corrigir evento" : `Evento de ${asset.ticker}`}</h2>
          <p className="hint">A quantidade é multiplicada pela proporção e o custo fica igual: o preço médio se ajusta sozinho.</p>
        </header>
        <div className="content">
          {tradeInstead && (
            <LaunchPicker
              chosen="corporate-action"
              choose={(k) => (k === "buy" || k === "sell") && tradeInstead(k)}
              offer={["corporate-action"]}
            />
          )}
          <label className="field">
            <span>Data</span>
            <input type="date" required max={today} value={draft.date} onChange={(e) => edit({ date: e.target.value })} />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select value={draft.kind} onChange={(e) => edit({ kind: e.target.value as CorporateActionDraft["kind"] })}>
              {CORPORATE_ACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CORPORATE_ACTION_NAMES[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="ratio-fields">
            <label className="field">
              <span>{bonus ? "Novas" : "De"}</span>
              <input
                required
                inputMode="numeric"
                className="num"
                value={draft.left}
                onChange={(e) => edit({ left: e.target.value })}
                placeholder="1"
              />
            </label>
            <span className="ratio-word">{bonus ? "para cada" : "para"}</span>
            <label className="field">
              <span>{bonus ? "Que já tinha" : "Para"}</span>
              <input
                required
                inputMode="numeric"
                className="num"
                value={draft.right}
                onChange={(e) => edit({ right: e.target.value })}
                placeholder={bonus ? "10" : "4"}
              />
            </label>
          </div>
          <p className="hint">
            {bonus ? "Como a empresa anuncia: 1 nova para cada 10." : "Como a empresa anuncia: 1 para 4 no desdobramento, 10 para 1 no grupamento."}{" "}
            Uma fração que sobrar fica na quantidade até você lançar a venda dela.
          </p>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          {action && (
            <button type="button" className="btn delete" disabled={running} onClick={() => run(remove)} title="Apaga de vez, sem lixeira">
              Apagar
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            {action ? "Salvar" : "Lançar"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
