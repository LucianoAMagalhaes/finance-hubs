import type { CSSProperties } from "react";
import {
  ASSET_CLASSES,
  DECIMAL_PLACES,
  dateOf,
  decimalToNumber,
  formatDate,
  formatReais,
  formatTime,
  type Asset,
  type AssetClass,
  type AssetTag,
  type Cents,
  type Currency,
  type Decimal,
  type IsoDate,
  type IsoDateTime,
  type PayoutKind,
  type TradeKind,
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

const USD = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

/**
 * "US$ 1.234,56", or "− US$ 297,90" when negative, like `formatReais`: the
 * amount may carry a fraction of a cent and is only rounded here.
 */
export function formatDollars(value: Cents): string {
  const cents = Math.round(Math.abs(value));
  const text = USD.format(cents / 100);
  return value < 0 && cents > 0 ? `− ${text}` : text;
}

/** An amount in its currency. */
export const formatMoney = (cents: Cents, currency: Currency) => (currency === "USD" ? formatDollars(cents) : formatReais(cents));

/** A gain: green with + when positive, red with − when negative. */
export function Gain({ cents, currency = "BRL" }: { cents: Cents; currency?: Currency }) {
  const rounded = Math.round(cents);
  if (rounded > 0) return <span className="val income">+ {formatMoney(cents, currency)}</span>;
  if (rounded < 0) return <span className="deficit">{formatMoney(cents, currency)}</span>;
  return <span className="val">{formatMoney(0, currency)}</span>;
}

/** The total gain as a percentage of the cost: "+ 18,3%", "− 4%". */
export function formatGainPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  if (rounded > 0) return `+ ${formatShare(rounded)}`;
  if (rounded < 0) return `− ${formatShare(-rounded)}`;
  return formatShare(0);
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
const UNIT_PRICE: Record<Currency, Intl.NumberFormat> = {
  BRL: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: DECIMAL_PLACES }),
  USD: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: DECIMAL_PLACES }),
};

/** A quantity, with as many places as it has: "100", "0,00321". */
export const formatQuantity = (quantity: Decimal) => QUANTITY.format(decimalToNumber(quantity));

/**
 * A price per unit, in cents of its currency. From R$ 1 (or US$ 1) up it
 * rounds to the cent like any amount; below it keeps up to 8 places, for the
 * price of a tiny crypto.
 */
export const formatUnitPrice = (cents: Cents, currency: Currency = "BRL") =>
  Math.abs(cents) >= 100 ? formatMoney(cents, currency) : UNIT_PRICE[currency].format(cents / 100);

export const KIND_NAMES: Record<TradeKind, string> = { buy: "Compra", sell: "Venda" };

export const PAYOUT_KIND_NAMES: Record<PayoutKind, string> = {
  dividend: "Dividendo",
  "interest-on-equity": "JCP",
  "fund-income": "Rendimento",
  interest: "Juros",
};

/** What a launch can be. */
export type LaunchKind = TradeKind | "payout";

const LAUNCH_NAMES: Record<LaunchKind, string> = { ...KIND_NAMES, payout: "Provento" };

/**
 * Buy, sale or, when offered, payout: the top of a launch's sheet. The payout
 * is offered from the top bar's + Lançar, which doesn't know yet what comes.
 */
export function LaunchPicker({
  chosen,
  choose,
  offerPayout = true,
}: {
  chosen: LaunchKind;
  choose: (kind: LaunchKind) => void;
  offerPayout?: boolean;
}) {
  const kinds: LaunchKind[] = offerPayout ? ["buy", "sell", "payout"] : ["buy", "sell"];
  return (
    <div className="shape-picker" role="group" aria-label="Tipo do lançamento">
      {kinds.map((k) => (
        <button type="button" key={k} aria-pressed={k === chosen} onClick={() => choose(k)}>
          {LAUNCH_NAMES[k]}
        </button>
      ))}
    </div>
  );
}

/** The asset of a launch opened from the top bar, grouped by class. */
export function AssetSelect({ assets, value, change }: { assets: Asset[]; value: string; change: (asset: string) => void }) {
  return (
    <label className="field">
      <span>Ativo</span>
      <select required value={value} onChange={(e) => change(e.target.value)}>
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
  );
}

/** The tag's words on the row; null for a tag the row shows in another way (the zero position is dimmed). */
const TAG_NAMES: Record<AssetTag, string | null> = {
  "no-quote": "sem cotação",
  "no-exchange-rate": "sem câmbio",
  "stale-quote": "cotação antiga",
  "zero-position": null,
};

/** What the row says about the asset beyond its numbers. */
export function Tags({ tags }: { tags: AssetTag[] }) {
  return tags.map(
    (t) =>
      TAG_NAMES[t] && (
        <span key={t} className="asset-tag">
          {TAG_NAMES[t]}
        </span>
      ),
  );
}

/** When a quote was obtained: "hoje, 14:32", or "24/09, 14:32" on another day. */
export function formatMoment(at: IsoDateTime, today: IsoDate): string {
  const date = dateOf(at);
  return `${date === today ? "hoje" : formatDate(date).slice(0, 5)}, ${formatTime(at)}`;
}
