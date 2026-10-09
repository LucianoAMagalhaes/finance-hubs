"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import { exchangeRateToField, formatDate, formatReais, type ContributionSuggestion, type IsoDate, type PortfolioCommand } from "@/portfolio/domain";
import type { Ptax } from "@/portfolio/sources";
import { formatQuantity, Tags } from "./parts";
import { isValidDate } from "@/shared";
import { Sheet } from "@/ui/Sheet";
import { Refusal } from "@/ui/Refusal";
import { useAction } from "@/ui/useAction";
import { buyReviewTotals, chooseBuyReviewTreasury, changeBuyReviewDate, editBuyReview, fillBuyReviewPtax, openBuyReview, readBuyReview, removeBuyReviewLine, type BuyReviewLine } from "./buyReviewDraft";

type Props = {
  suggestion: ContributionSuggestion;
  today: IsoDate;
  suggestExchangeRate: (date: IsoDate) => Promise<Ptax | null>;
  save: (command: Extract<PortfolioCommand, { type: "save-buys" }>) => Promise<string | null>;
  close: () => void;
};

/** Reviews actual purchases once, then sends a single atomic command. */
export function BuyReviewForm({ suggestion, today, suggestExchangeRate, save, close }: Props) {
  const [draft, setDraft] = useState(() => openBuyReview(suggestion, today));
  const [ptax, setPtax] = useState<{ date: string; value: Ptax | null } | null>(null);
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const dollar = draft.lines.some(line => line.shape === "USD");

  useEffect(() => {
    if (!dollar || !isValidDate(draft.date) || draft.date > today) return;
    const date = draft.date;
    let current = true;
    startTransition(async () => {
      const value = await suggestExchangeRate(date as IsoDate).catch(() => null);
      if (!current) return;
      setPtax({ date, value });
      setDraft(d => fillBuyReviewPtax(d, date, value));
    });
    return () => { current = false; };
  }, [dollar, draft.date, today, suggestExchangeRate]);

  function edit(asset: number, change: Partial<Pick<BuyReviewLine, "quantity" | "unitPrice" | "amount" | "exchangeRate">>) {
    clearRefusal();
    setDraft(d => editBuyReview(d, asset, change));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = readBuyReview(draft);
    if (!checked.ok) { refuse(checked.error); return; }
    await run(() => save(checked.value).catch(() => "Não foi possível registrar as compras. Os valores foram mantidos; tente novamente."));
  }

  const totals = buyReviewTotals(draft);
  const fixedIncome = suggestion.classes.find(c => c.key === "fixed-income");
  const currentPtax = ptax?.date === draft.date ? ptax : null;
  return (
    <Sheet labelledBy="buy-review-title" className="buy-review" close={close} closingDisabled={running}>
      <form onSubmit={submit}>
        <header>
          <h2 id="buy-review-title">Revisar compras</h2>
          <p className="hint">Corrija o que comprou de fato. Todas as linhas são registradas juntas ou nenhuma é gravada. Compras de datas distintas devem ser lançadas à parte.</p>
        </header>
        <div className="content">
          <fieldset disabled={running} className="buy-review-fields">
            <label className="field">
              <span>Data de todas as compras</span>
              <input type="date" required max={today} value={draft.date} onChange={e => {
                clearRefusal();
                setDraft(d => changeBuyReviewDate(d, e.target.value));
              }} />
            </label>
            {draft.fixedIncome.budget > 0 && <fieldset className="buy-review-line">
              <legend>Escolher um título do Tesouro para Renda Fixa</legend>
              <p className="hint">Parcela original da classe: {formatReais(draft.fixedIncome.budget)}, incluindo o valor que ficou sem destino. Escolher substitui as compras de Renda Fixa e mantém as demais compras revisadas.</p>
              {draft.fixedIncome.options.map(option => <div key={option.id}>
                <strong>{option.ticker}</strong>
                {option.belowMinimum && <p className="hint">A parcela inicial deste título não comprava a fração mínima de 0,01 título. Ele continua apto a receber aporte.</p>}
                <p className="hint">Preço usado: {formatReais(option.price!)} · cabe comprar {formatQuantity(option.quantity)} título(s) por {formatReais(option.amount)}.</p>
                {option.quantity === 0 && <p className="hint">A parcela da classe também não compra uma fração mínima deste título.</p>}
                <button type="button" className="btn" disabled={option.quantity === 0} onClick={() => {
                  clearRefusal();
                  setDraft(d => chooseBuyReviewTreasury(d, option.id));
                }}>Escolher {option.ticker}</button>
              </div>)}
              {fixedIncome?.assets.filter(a => a.bondKind === "treasury-bond" && a.exclusions.length > 0).map(a => <div key={a.id}>
                <strong>{a.ticker}</strong>
                <p className="hint">Impedido de receber aporte:</p><Tags tags={a.exclusions} />
              </div>)}
            </fieldset>}
            {dollar && <p className="hint" aria-live="polite">
              {!isValidDate(draft.date) || draft.date > today ? "Escolha uma data válida até hoje para consultar a PTAX."
                : currentPtax === null ? "Buscando a PTAX de venda…"
                : currentPtax.value === null ? "O BCB não respondeu: informe manualmente o câmbio de cada compra em dólar."
                : `PTAX de venda de ${formatDate(currentPtax.value.date)}: R$ ${exchangeRateToField(currentPtax.value.rate)} por US$ 1. O câmbio de cada operação pode ser editado.`}
            </p>}
            {draft.lines.map((line, index) => (
              <fieldset key={line.asset} className="buy-review-line">
                <legend>Linha {index + 1} · {line.ticker}</legend>
                {line.shape === "private-bond" ? (
                  <label className="field"><span>Valor aplicado (R$)</span><input required inputMode="decimal" className="num" value={line.amount} onChange={e => edit(line.asset, { amount: e.target.value })} /></label>
                ) : (
                  <div className="cols-2">
                    <label className="field"><span>Quantidade</span><input required inputMode="decimal" className="num" value={line.quantity} onChange={e => edit(line.asset, { quantity: e.target.value })} /></label>
                    <label className="field"><span>Preço unitário ({line.shape === "USD" ? "US$" : "R$"})</span><input required inputMode="decimal" className="num" value={line.unitPrice} onChange={e => edit(line.asset, { unitPrice: e.target.value })} /></label>
                  </div>
                )}
                {line.shape === "USD" && <label className="field"><span>Câmbio da operação (R$ por US$)</span><input required inputMode="decimal" className="num" value={line.exchangeRate} onChange={e => edit(line.asset, { exchangeRate: e.target.value })} /></label>}
                <button type="button" className="btn delete" onClick={() => {
                  clearRefusal();
                  setDraft(d => removeBuyReviewLine(d, line.asset));
                }}>Remover {line.ticker}</button>
              </fieldset>
            ))}
          </fieldset>
          {draft.lines.length === 0 && <p className="hint">Nenhuma compra restante. Cancele para voltar à sugestão.</p>}
          <div aria-live="polite">
            {totals === null ? <p className="hint">Preencha quantidade, preço, valor e câmbio das compras para calcular o total e o valor sem destino.</p> : <dl className="contribution-totals">
              <div><dt>Aporte</dt><dd className="num">{formatReais(draft.contribution)}</dd></div>
              <div><dt>Total das compras</dt><dd className="num">{formatReais(totals.total)}</dd></div>
              <div><dt>{totals.excess > 0 ? "Excedente ao aporte" : "Sem destino"}</dt><dd className="num">{formatReais(totals.excess > 0 ? totals.excess : totals.unallocated)}</dd></div>
            </dl>}
          </div>
          <p className="hint">O valor sem destino não gera outras compras, operação ou saldo na carteira. Você pode revisar os dados reais antes de confirmar.</p>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" disabled={running} onClick={close}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={running || draft.lines.length === 0}>{running ? "Registrando…" : "Registrar compras"}</button>
        </footer>
      </form>
    </Sheet>
  );
}
