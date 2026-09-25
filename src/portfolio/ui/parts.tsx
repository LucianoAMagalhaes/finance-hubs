import type { CSSProperties } from "react";
import {
  DECIMAL_PLACES,
  decimalToNumber,
  formatReais,
  type AssetClass,
  type AssetTag,
  type Cents,
  type Decimal,
  type IsoDate,
} from "@/portfolio/domain";

/**
 * The class's fixed color. The shared card, swatch and bar styles read it as
 * `--jar`; `--class` is the portfolio's own name for it, for its own pieces.
 */
export const classColor = (id: AssetClass) =>
  ({ "--class": `var(--class-${id})`, "--jar": `var(--class-${id})` }) as CSSProperties;

const SHARE = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** A share of the portfolio: "18,2%", "25%", "0%". */
export const formatShare = (percent: number) => `${SHARE.format(percent)}%`;

/** A gain: green with + when positive, red with − when negative. */
export function Gain({ cents }: { cents: Cents }) {
  const rounded = Math.round(cents);
  if (rounded > 0) return <span className="val income">+ {formatReais(cents)}</span>;
  if (rounded < 0) return <span className="deficit">{formatReais(cents)}</span>;
  return <span className="val">{formatReais(0)}</span>;
}

/**
 * How far a class is from its target's value. When the amount rounds to
 * nothing but the shares still differ — a portfolio worth nothing —, the
 * direction comes from the shares.
 */
export function ToTarget({ toTarget, share, target }: { toTarget: Cents; share: number; target: number }) {
  const direction = Math.sign(Math.round(toTarget)) || Math.sign(target - share);
  if (direction > 0) return <span className="to-target short">faltam {formatReais(Math.max(toTarget, 0))}</span>;
  if (direction < 0) return <span className="to-target over">{formatReais(Math.max(-toTarget, 0))} acima</span>;
  return <span className="to-target">no alvo</span>;
}

const QUANTITY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: DECIMAL_PLACES });
const UNIT_PRICE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: DECIMAL_PLACES });

/** A quantity, with as many places as it has: "100", "0,00321". */
export const formatQuantity = (quantity: Decimal) => QUANTITY.format(decimalToNumber(quantity));

/**
 * A price per unit, in cents. From R$ 1 up it rounds to the cent like any
 * amount; below it keeps up to 8 places, for the price of a tiny crypto.
 */
export const formatUnitPrice = (cents: Cents) => (Math.abs(cents) >= 100 ? formatReais(cents) : UNIT_PRICE.format(cents / 100));

/** "10/03/2026". */
export const formatDate = (date: IsoDate) => `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

const TAG_NAMES: Record<AssetTag, string> = { "no-quote": "sem cotação" };

/** What the row says about the asset beyond its numbers. */
export function Tags({ tags }: { tags: AssetTag[] }) {
  return tags.map((t) => (
    <span key={t} className="asset-tag">
      {TAG_NAMES[t]}
    </span>
  ));
}
