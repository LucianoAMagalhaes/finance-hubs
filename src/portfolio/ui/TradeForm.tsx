"use client";

import { useState, type FormEvent } from "react";
import { ASSET_CLASSES, formatReais, type Asset, type IsoDate, type Trade, type TradeKind, type TradeToSave } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { KIND_NAMES } from "./parts";
import { checkTradeDraft, emptyTradeDraft, tradeDraftFrom, type TradeDraft } from "./tradeDraft";

type Props = {
  /** Every asset, to choose from when the sheet opens from the top bar. */
  assets: Asset[];
  /** The asset whose row a new trade opened from; null from the top bar, and when correcting. */
  asset: Asset | null;
  /** The trade being corrected; null for a new one. */
  trade: Trade | null;
  today: IsoDate;
  /** Returns the refusal, or null if it saved. */
  save: (trade: TradeToSave) => Promise<string | null>;
  /** Deletes the trade being corrected for good. Returns the refusal, or null if it deleted. */
  delete: () => Promise<string | null>;
  close: () => void;
};

const KINDS: TradeKind[] = ["buy", "sell"];

/**
 * A buy or a sale: date, quantity and unit price. No fee field: the price is
 * what was paid or received. A saved trade opens here to have any field
 * corrected, or to be deleted for good.
 */
export function TradeForm({ assets, asset, trade, today, save, delete: remove, close }: Props) {
  const [draft, setDraft] = useState<TradeDraft>(() => (trade ? tradeDraftFrom(trade) : emptyTradeDraft(today, asset?.id ?? null)));
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const checked = checkTradeDraft(draft);
  const edit = (change: Partial<TradeDraft>) => {
    clearRefusal();
    setDraft({ ...draft, ...change });
  };

  const kind = KIND_NAMES[draft.kind];
  const title = trade ? `Corrigir ${kind.toLowerCase()}` : asset ? `${kind} de ${asset.ticker}` : `Nova ${kind.toLowerCase()}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (checked.error) {
      refuse(checked.error);
      return;
    }
    await run(() => save(checked.trade));
  }

  return (
    <Sheet labelledBy="trade-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="trade-title">{title}</h2>
          <p className="hint">O preço é o que foi pago ou recebido por unidade, sem campo de taxa. A quantidade aceita frações.</p>
        </header>
        <div className="content">
          <div className="shape-picker" role="group" aria-label="Tipo da operação">
            {KINDS.map((k) => (
              <button type="button" key={k} aria-pressed={k === draft.kind} onClick={() => edit({ kind: k })}>
                {KIND_NAMES[k]}
              </button>
            ))}
          </div>
          {!asset && (
            <label className="field">
              <span>Ativo</span>
              <select required value={draft.asset} onChange={(e) => edit({ asset: e.target.value })}>
                <option value="" disabled>
                  Escolha o ativo
                </option>
                {ASSET_CLASSES.map((c) => {
                  const own = assets.filter((a) => a.assetClass === c.id).sort((a, b) => a.ticker.localeCompare(b.ticker));
                  return (
                    own.length > 0 && (
                      <optgroup key={c.id} label={c.name}>
                        {own.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.ticker}
                          </option>
                        ))}
                      </optgroup>
                    )
                  );
                })}
              </select>
            </label>
          )}
          <label className="field">
            <span>Data</span>
            <input type="date" required max={today} value={draft.date} onChange={(e) => edit({ date: e.target.value })} />
          </label>
          <div className="cols-2">
            <label className="field">
              <span>Quantidade</span>
              <input
                required
                inputMode="decimal"
                className="num"
                value={draft.quantity}
                onChange={(e) => edit({ quantity: e.target.value })}
                placeholder="0"
              />
            </label>
            <label className="field">
              <span>Preço unitário (R$)</span>
              <input
                required
                inputMode="decimal"
                className="num"
                value={draft.unitPrice}
                onChange={(e) => edit({ unitPrice: e.target.value })}
                placeholder="0,00"
              />
            </label>
          </div>
          <p className="trade-total num" aria-live="polite">
            Total {checked.total === null ? "—" : formatReais(checked.total)}
          </p>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          {trade && (
            <button type="button" className="btn delete" disabled={running} onClick={() => run(remove)} title="Apaga de vez, sem lixeira">
              Apagar
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            {trade ? "Salvar" : "Lançar"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
