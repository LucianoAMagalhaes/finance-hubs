"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  currencyOf,
  exchangeRateToField,
  formatDate,
  formatReais,
  type Asset,
  type IsoDate,
  type Trade,
  type TradeKind,
  type TradeToSave,
} from "@/portfolio/domain";
import type { Ptax } from "@/portfolio/sources";
import { isValidDate } from "@/shared";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { AssetSelect, formatMoney, KIND_NAMES, LaunchPicker } from "./parts";
import { checkTradeDraft, emptyTradeDraft, tradeDraftFrom, type TradeDraft } from "./tradeDraft";

type Props = {
  /** Every asset, to choose from when the sheet opens from the top bar. */
  assets: Asset[];
  /** The asset whose row a new trade opened from; null from the top bar, and when correcting. */
  asset: Asset | null;
  /** The trade being corrected; null for a new one. */
  trade: Trade | null;
  /** The kind a new trade opens with. */
  kind: TradeKind;
  today: IsoDate;
  /** From the top bar, turns the sheet into a payout; absent otherwise. */
  payoutInstead?: () => void;
  /** The selling PTAX of the date, or the last one before; null with the BCB down. */
  suggestExchangeRate: (date: IsoDate) => Promise<Ptax | null>;
  /** Returns the refusal, or null if it saved. */
  save: (trade: TradeToSave) => Promise<string | null>;
  /** Deletes the trade being corrected for good. Returns the refusal, or null if it deleted. */
  delete: () => Promise<string | null>;
  close: () => void;
};

/** The PTAX asked for a date: undefined while the BCB is being asked, null when it didn't answer. */
type Suggestion = { date: string; ptax: Ptax | null | undefined };

/**
 * A buy or a sale: date, quantity and unit price in the asset's currency. No
 * fee field: the price is what was paid or received. In dollars it also takes
 * the exchange rate of the trade, suggested by the selling PTAX of the date
 * when the sheet opens and at each change of date: a new trade takes the
 * suggestion until the person types a rate, and a saved trade only shows it
 * beside its own rate, which never changes by itself. A saved trade opens here
 * to have any field corrected, or to be deleted for good.
 */
export function TradeForm({
  assets,
  asset,
  trade,
  kind: initialKind,
  today,
  payoutInstead,
  suggestExchangeRate,
  save,
  delete: remove,
  close,
}: Props) {
  const [draft, setDraft] = useState<TradeDraft>(() =>
    trade ? tradeDraftFrom(trade) : { ...emptyTradeDraft(today, asset?.id ?? null), kind: initialKind },
  );
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const chosen = assets.find((a) => String(a.id) === draft.asset);
  const currency = chosen ? currencyOf(chosen.assetClass) : "BRL";
  const dollar = currency === "USD";
  const checked = checkTradeDraft(draft, currency);
  const edit = (change: Partial<TradeDraft>) => {
    clearRefusal();
    setDraft((d) => ({ ...d, ...change }));
  };

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  /** Whether the person typed the rate of a new trade, which a suggestion then never replaces. */
  const typedRate = useRef(false);
  useEffect(() => {
    if (!dollar || !isValidDate(draft.date)) return;
    const date = draft.date;
    let current = true;
    setSuggestion({ date, ptax: undefined });
    void suggestExchangeRate(date).then((ptax) => {
      if (!current) return;
      setSuggestion({ date, ptax });
      if (!trade && !typedRate.current) setDraft((d) => ({ ...d, exchangeRate: ptax ? exchangeRateToField(ptax.rate) : "" }));
    });
    return () => {
      current = false;
    };
  }, [dollar, draft.date, trade, suggestExchangeRate]);

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
          <LaunchPicker
            chosen={draft.kind}
            choose={(k) => (k === "payout" ? payoutInstead?.() : edit({ kind: k }))}
            offerPayout={payoutInstead !== undefined}
          />
          {!asset && <AssetSelect assets={assets} value={draft.asset} change={(a) => edit({ asset: a })} />}
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
              <span>Preço unitário ({dollar ? "US$" : "R$"})</span>
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
          {dollar && (
            <label className="field">
              <span>Câmbio da operação (R$ por US$)</span>
              <input
                required
                inputMode="decimal"
                className="num"
                value={draft.exchangeRate}
                onChange={(e) => {
                  typedRate.current = true;
                  edit({ exchangeRate: e.target.value });
                }}
                placeholder="0,0000"
              />
              <SuggestionHint
                suggestion={suggestion?.date === draft.date ? suggestion : null}
                typed={draft.exchangeRate}
                use={(rate) => edit({ exchangeRate: rate })}
              />
            </label>
          )}
          <p className="trade-total num" aria-live="polite">
            Total {checked.total === null ? "—" : formatMoney(checked.total, currency)}
            {dollar && checked.totalInReais !== null && ` · ${formatReais(checked.totalInReais)}`}
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

/** The PTAX beside the rate: being asked, the BCB down, or the suggestion, with a button to take it when it isn't the rate typed. */
function SuggestionHint({ suggestion, typed, use }: { suggestion: Suggestion | null; typed: string; use: (rate: string) => void }) {
  if (!suggestion || suggestion.ptax === undefined) return <small className="hint">Buscando a PTAX de venda…</small>;
  if (suggestion.ptax === null) return <small className="hint">O BCB não respondeu: informe o câmbio que a corretora usou.</small>;
  const rate = exchangeRateToField(suggestion.ptax.rate);
  return (
    <small className="hint">
      PTAX de venda de {formatDate(suggestion.ptax.date)}: <span className="num">{rate}</span>
      {rate !== typed.trim() && (
        <>
          {" "}
          <button type="button" className="link" onClick={() => use(rate)}>
            usar
          </button>
        </>
      )}
    </small>
  );
}
