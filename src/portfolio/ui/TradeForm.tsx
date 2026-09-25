"use client";

import { useState, type FormEvent } from "react";
import { ASSET_CLASSES, formatReais, type Asset, type IsoDate, type TradeToSave } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { checkTradeDraft, emptyTradeDraft, type TradeDraft } from "./tradeDraft";

type Props = {
  /** Every asset, to choose from when the sheet opens from the top bar. */
  assets: Asset[];
  /** The asset whose row the sheet opened from; null from the top bar. */
  asset: Asset | null;
  today: IsoDate;
  /** Returns the refusal, or null if it saved. */
  save: (trade: TradeToSave) => Promise<string | null>;
  close: () => void;
};

/** A buy: date, quantity and unit price. No fee field: the price is what was paid. */
export function TradeForm({ assets, asset, today, save, close }: Props) {
  const [draft, setDraft] = useState<TradeDraft>(() => emptyTradeDraft(today, asset?.id ?? null));
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const checked = checkTradeDraft(draft);
  const edit = (change: Partial<TradeDraft>) => {
    clearRefusal();
    setDraft({ ...draft, ...change });
  };

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
          <h2 id="trade-title">{asset ? `Compra de ${asset.ticker}` : "Nova compra"}</h2>
          <p className="hint">O preço é o que foi pago por unidade, sem campo de taxa. A quantidade aceita frações.</p>
        </header>
        <div className="content">
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
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            Lançar
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
