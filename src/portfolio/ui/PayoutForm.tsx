"use client";

import { useState, type FormEvent } from "react";
import { PAYOUT_KINDS, type Asset, type IsoDate, type Payout, type PayoutToSave, type TradeKind } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { AssetSelect, LaunchPicker, PAYOUT_KIND_NAMES } from "./parts";
import { checkPayoutDraft, emptyPayoutDraft, payoutDraftFrom, type PayoutDraft } from "./payoutDraft";

type Props = {
  /** Every asset, to choose from when the sheet opens from the top bar. */
  assets: Asset[];
  /** The asset whose row a new payout opened from; null from the top bar, and when correcting. */
  asset: Asset | null;
  /** The payout being corrected; null for a new one. */
  payout: Payout | null;
  today: IsoDate;
  /** From the top bar, turns the sheet into a trade of that kind; absent otherwise. */
  tradeInstead?: (kind: TradeKind) => void;
  /** Returns the refusal, or null if it saved. */
  save: (payout: PayoutToSave) => Promise<string | null>;
  /** Deletes the payout being corrected for good. Returns the refusal, or null if it deleted. */
  delete: () => Promise<string | null>;
  close: () => void;
};

/**
 * A payout typed by hand: payment date, kind and the amount received in
 * reais, already net. A saved payout opens here to have any field corrected,
 * or to be deleted for good.
 */
export function PayoutForm({ assets, asset, payout, today, tradeInstead, save, delete: remove, close }: Props) {
  const [draft, setDraft] = useState<PayoutDraft>(() => (payout ? payoutDraftFrom(payout) : emptyPayoutDraft(today, asset?.id ?? null)));
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const edit = (change: Partial<PayoutDraft>) => {
    clearRefusal();
    setDraft({ ...draft, ...change });
  };

  const title = payout ? "Corrigir provento" : asset ? `Provento de ${asset.ticker}` : "Novo provento";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkPayoutDraft(draft);
    if (checked.error) {
      refuse(checked.error);
      return;
    }
    await run(() => save(checked.payout));
  }

  return (
    <Sheet labelledBy="payout-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="payout-title">{title}</h2>
          <p className="hint">O valor é o que caiu na conta, já líquido. O provento entra no ganho total, sem mudar a quantidade nem o custo.</p>
        </header>
        <div className="content">
          {tradeInstead && <LaunchPicker chosen="payout" choose={(k) => k !== "payout" && tradeInstead(k)} />}
          {!asset && <AssetSelect assets={assets} value={draft.asset} change={(a) => edit({ asset: a })} />}
          <label className="field">
            <span>Data de pagamento</span>
            <input type="date" required max={today} value={draft.date} onChange={(e) => edit({ date: e.target.value })} />
          </label>
          <div className="cols-2">
            <label className="field">
              <span>Tipo</span>
              <select value={draft.kind} onChange={(e) => edit({ kind: e.target.value as PayoutDraft["kind"] })}>
                {PAYOUT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PAYOUT_KIND_NAMES[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Valor líquido (R$)</span>
              <input
                required
                inputMode="decimal"
                className="num"
                value={draft.amount}
                onChange={(e) => edit({ amount: e.target.value })}
                placeholder="0,00"
              />
            </label>
          </div>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          {payout && (
            <button type="button" className="btn delete" disabled={running} onClick={() => run(remove)} title="Apaga de vez, sem lixeira">
              Apagar
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            {payout ? "Salvar" : "Lançar"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
