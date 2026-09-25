import type { CSSProperties } from "react";
import { formatReais, type AssetClass, type Cents } from "@/portfolio/domain";

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
