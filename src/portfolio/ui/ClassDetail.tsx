"use client";

import { Fragment } from "react";
import {
  decimalToNumber,
  exchangeRateToField,
  formatDate,
  formatReais,
  type AssetView,
  type ClassView,
  type CorporateActionView,
  type IsoDate,
  type TradeView,
} from "@/portfolio/domain";
import { describeRatio } from "./corporateActionDraft";
import {
  classColor,
  CORPORATE_ACTION_NAMES,
  formatDollars,
  formatGainPercent,
  formatMoment,
  formatQuantity,
  formatShare,
  formatUnitPrice,
  Gain,
  KIND_NAMES,
  PAYOUT_KIND_NAMES,
  Tags,
  ToTarget,
} from "./parts";

type Props = {
  c: ClassView;
  today: IsoDate;
  /** The asset whose row is expanded, or null. */
  expanded: number | null;
  expand: (asset: number | null) => void;
  close: () => void;
  /** Opens a new trade of the asset. */
  newTrade: (asset: number) => void;
  /** Opens the correction of the trade. */
  editTrade: (trade: number) => void;
  /** Opens the correction of the corporate action. */
  editAction: (action: number) => void;
  /** Opens a new payout of the asset. */
  newPayout: (asset: number) => void;
  /** Opens the correction of the payout. */
  editPayout: (payout: number) => void;
  /** Opens the correction of the asset's ticker. */
  editAsset: (asset: number) => void;
  /** Opens the deletion of the asset. */
  deleteAsset: (asset: number) => void;
};

/**
 * The open class beside the column of cards (variation E): its header, and
 * its assets in a table whose rows expand in place with the trades and
 * payouts. A zero position stays, dimmed and last, with its total gain. An
 * asset in dollars shows its prices in dollars, and its average price, value
 * and gain in both currencies; the class's numbers stay in reais.
 */
export function ClassDetail({ c, today, expanded, expand, close, newTrade, editTrade, editAction, newPayout, editPayout, editAsset, deleteAsset }: Props) {
  return (
    <section className="detail class-detail" aria-label={c.name} style={classColor(c.key)}>
      <header>
        <span className="handle" aria-hidden />
        <button type="button" className="close" onClick={close} aria-label="Fechar o detalhe e voltar à grade">
          ×
        </button>
        <div className="kicker">Classe</div>
        <h2>
          <span className="swatch" />
          {c.name}
        </h2>
        <div className="detail-summary">
          <span className="detail-total num">{formatReais(c.value)}</span>
          <ToTarget toTarget={c.toTarget} share={c.share} target={c.target} />
          <span className="hint num">
            ganho <Gain cents={c.totalGain} />
          </span>
        </div>
        <p className="hint">
          {formatShare(c.share)} da carteira · alvo {c.target}%
        </p>
      </header>
      {c.assets.length === 0 ? (
        <p className="empty-detail">Nenhum ativo nesta classe.</p>
      ) : (
        <div className="asset-scroll">
          <table className="asset-table">
            <thead>
              <tr>
                <th>Ativo</th>
                <th className="right">Quantidade</th>
                <th className="right">Preço médio</th>
                <th className="right">Cotação</th>
                <th className="right">Valor atual</th>
                <th className="right">Ganho total</th>
              </tr>
            </thead>
            <tbody>
              {c.assets.map((a) => (
                <AssetRow
                  key={a.id}
                  a={a}
                  today={today}
                  open={expanded === a.id}
                  toggle={() => expand(expanded === a.id ? null : a.id)}
                  newTrade={() => newTrade(a.id)}
                  editTrade={editTrade}
                  editAction={editAction}
                  newPayout={() => newPayout(a.id)}
                  editPayout={editPayout}
                  editAsset={() => editAsset(a.id)}
                  deleteAsset={() => deleteAsset(a.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type RowProps = {
  a: AssetView;
  today: IsoDate;
  open: boolean;
  toggle: () => void;
  newTrade: () => void;
  editTrade: (trade: number) => void;
  editAction: (action: number) => void;
  newPayout: () => void;
  editPayout: (payout: number) => void;
  editAsset: () => void;
  deleteAsset: () => void;
};

function AssetRow({ a, today, open, toggle, ...actions }: RowProps) {
  const zero = a.tags.includes("zero-position");
  const usd = a.inDollars;
  return (
    <Fragment>
      <tr className={`clickable ${open ? "expanded" : ""} ${zero ? "zero-position" : ""}`} onClick={toggle} aria-expanded={open}>
        <td>
          <span className="caret" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span className="asset-name">
            <strong>{a.ticker}</strong>
            <Tags tags={a.tags} />
          </span>
        </td>
        <td className="right num">{zero ? "—" : formatQuantity(a.quantity)}</td>
        <td className="right num">
          {usd ? (
            usd.averagePrice === null ? (
              "—"
            ) : (
              <>
                {formatUnitPrice(usd.averagePrice, "USD")}
                <small className="sub">{formatUnitPrice(a.averagePrice!)}</small>
              </>
            )
          ) : a.averagePrice === null ? (
            "—"
          ) : (
            formatUnitPrice(a.averagePrice)
          )}
        </td>
        <td className="right num" title={a.quoteAt ? `cotação de ${formatMoment(a.quoteAt, today)}` : undefined}>
          {a.quote === null ? "—" : formatUnitPrice(a.quote, a.currency)}
        </td>
        <td className="right num">
          {zero ? "—" : formatReais(a.currentValue)}
          {usd && !zero && <small className="sub">{formatDollars(usd.currentValue)}</small>}
        </td>
        <td className="right num">
          {!zero && Math.round(a.totalGain) === 0 ? "—" : <Gain cents={a.totalGain} />}
          {usd && !zero && (
            <small className="sub">
              <Gain cents={usd.totalGain} currency="USD" />
            </small>
          )}
          {a.totalGainPercent !== null && <small className="sub">{formatGainPercent(a.totalGainPercent)}</small>}
        </td>
      </tr>
      {open && (
        <tr className="inline-row">
          <td colSpan={6}>
            <History a={a} {...actions} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * The trades and corporate actions of the asset, newest first. On the same
 * date the actions count before the trades, so they are listed after them.
 */
function tradesAndActions(a: AssetView): ({ trade: TradeView } | { action: CorporateActionView })[] {
  const listed: ({ trade: TradeView } | { action: CorporateActionView })[] = [];
  let next = 0;
  for (const trade of a.trades) {
    while (next < a.corporateActions.length && a.corporateActions[next]!.date > trade.date) listed.push({ action: a.corporateActions[next++]! });
    listed.push({ trade });
  }
  return [...listed, ...a.corporateActions.slice(next).map((action) => ({ action }))];
}

/**
 * The asset's trades, corporate actions and payouts, newest first; clicking
 * one opens its correction. In dollars, each trade shows its exchange rate and
 * its total in dollars and in reais. An action has no price: only its ratio.
 */
function History({ a, newTrade, editTrade, editAction, newPayout, editPayout, editAsset, deleteAsset }: Omit<RowProps, "today" | "open" | "toggle">) {
  const dollar = a.currency === "USD";
  const entries = tradesAndActions(a);
  return (
    <div className="history">
      <div className="history-head">
        <h3>Operações</h3>
        <span className="history-actions">
          <button type="button" className="btn" onClick={editAsset} title="Quando a empresa troca de código">
            Corrigir código
          </button>
          <button type="button" className="btn" onClick={deleteAsset}>
            Apagar ativo
          </button>
          <button type="button" className="btn" onClick={newTrade}>
            + Operação
          </button>
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="history-empty">Nenhuma operação. O ativo existe com quantidade zero.</p>
      ) : (
        <table className="ops">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th className="right">Quantidade</th>
              <th className="right">Preço</th>
              {dollar && <th className="right">Câmbio</th>}
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              if ("action" in entry) {
                const e = entry.action;
                return (
                  <tr key={`action-${e.id}`} className="clickable" onClick={() => editAction(e.id)} title="Corrigir ou apagar">
                    <td className="num">{formatDate(e.date)}</td>
                    <td colSpan={dollar ? 5 : 4}>
                      <span className="trade-kind corporate-action">
                        {CORPORATE_ACTION_NAMES[e.kind]} {describeRatio(e.kind, e.ratio)}
                      </span>
                    </td>
                  </tr>
                );
              }
              const t = entry.trade;
              return (
              <tr key={t.id} className="clickable" onClick={() => editTrade(t.id)} title="Corrigir ou apagar">
                <td className="num">{formatDate(t.date)}</td>
                <td>
                  <span className={`trade-kind ${t.kind}`}>{KIND_NAMES[t.kind]}</span>
                </td>
                <td className="right num">{formatQuantity(t.quantity)}</td>
                <td className="right num">{formatUnitPrice(decimalToNumber(t.unitPrice) * 100, a.currency)}</td>
                {dollar && <td className="right num">{t.exchangeRate === null ? "—" : exchangeRateToField(t.exchangeRate)}</td>}
                <td className="right num">
                  {t.dollarTotal !== null && formatDollars(t.dollarTotal)}
                  {t.dollarTotal === null ? formatReais(t.total) : <small className="sub">{formatReais(t.total)}</small>}
                  {t.realizedGain !== null && (
                    <small className="realized-gain">
                      resultado <Gain cents={t.realizedGain} />
                    </small>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="history-head">
        <h3>Proventos</h3>
        <button type="button" className="btn" onClick={newPayout}>
          + Provento
        </button>
      </div>
      {a.payouts.length === 0 ? (
        <p className="history-empty">Nenhum provento.</p>
      ) : (
        <table className="ops">
          <thead>
            <tr>
              <th>Pagamento</th>
              <th>Tipo</th>
              <th className="right">Valor líquido</th>
            </tr>
          </thead>
          <tbody>
            {a.payouts.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => editPayout(p.id)} title="Corrigir ou apagar">
                <td className="num">{formatDate(p.date)}</td>
                <td>{PAYOUT_KIND_NAMES[p.kind]}</td>
                <td className="right num">
                  <span className="val income">{formatReais(p.amount)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
