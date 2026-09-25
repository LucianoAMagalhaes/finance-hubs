"use client";

import { Fragment } from "react";
import { decimalToNumber, formatReais, type AssetView, type ClassView, type TradeKind } from "@/portfolio/domain";
import { classColor, formatDate, formatQuantity, formatShare, formatUnitPrice, Gain, Tags, ToTarget } from "./parts";

type Props = {
  c: ClassView;
  /** The asset whose row is expanded, or null. */
  expanded: number | null;
  expand: (asset: number | null) => void;
  close: () => void;
  /** Opens a new buy of the asset. */
  buy: (asset: number) => void;
};

/**
 * The open class beside the column of cards (variation E): its header, and
 * its assets in a table whose rows expand in place with the trades.
 */
export function ClassDetail({ c, expanded, expand, close, buy }: Props) {
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
                <AssetRow key={a.id} a={a} open={expanded === a.id} toggle={() => expand(expanded === a.id ? null : a.id)} buy={() => buy(a.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AssetRow({ a, open, toggle, buy }: { a: AssetView; open: boolean; toggle: () => void; buy: () => void }) {
  return (
    <Fragment>
      <tr className={`clickable ${open ? "expanded" : ""}`} onClick={toggle} aria-expanded={open}>
        <td>
          <span className="caret" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span className="asset-name">
            <strong>{a.ticker}</strong>
            <Tags tags={a.tags} />
          </span>
        </td>
        <td className="right num">{formatQuantity(a.quantity)}</td>
        <td className="right num">{a.averagePrice === null ? "—" : formatUnitPrice(a.averagePrice)}</td>
        <td className="right num">{a.quote === null ? "—" : formatUnitPrice(a.quote)}</td>
        <td className="right num">{formatReais(a.currentValue)}</td>
        <td className="right num">{Math.round(a.totalGain) === 0 ? "—" : <Gain cents={a.totalGain} />}</td>
      </tr>
      {open && (
        <tr className="inline-row">
          <td colSpan={6}>
            <History a={a} buy={buy} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

const KIND_NAMES: Record<TradeKind, string> = { buy: "Compra" };

/** The asset's trades, newest first. */
function History({ a, buy }: { a: AssetView; buy: () => void }) {
  return (
    <div className="history">
      <div className="history-head">
        <h3>Operações</h3>
        <button type="button" className="btn" onClick={buy}>
          + Operação
        </button>
      </div>
      {a.trades.length === 0 ? (
        <p className="history-empty">Nenhuma operação. O ativo existe com quantidade zero.</p>
      ) : (
        <table className="ops">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th className="right">Quantidade</th>
              <th className="right">Preço</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {a.trades.map((t) => (
              <tr key={t.id}>
                <td className="num">{formatDate(t.date)}</td>
                <td>
                  <span className={`trade-kind ${t.kind}`}>{KIND_NAMES[t.kind]}</span>
                </td>
                <td className="right num">{formatQuantity(t.quantity)}</td>
                <td className="right num">{formatUnitPrice(decimalToNumber(t.unitPrice) * 100)}</td>
                <td className="right num">{formatReais(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
