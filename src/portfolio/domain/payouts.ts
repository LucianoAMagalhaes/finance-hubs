import { isValidDate, type Cents, type IsoDate, type Result } from "@/shared";
import type { Decimal } from "./decimal";
import { replay } from "./position";
import { nextId, type PortfolioState } from "./state";

export const PAYOUT_KINDS = ["dividend", "interest-on-equity", "fund-income", "interest"] as const;

/** Only informative: it changes nothing in the numbers. */
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

/**
 * Money an asset paid the person: the payment date and the amount received in
 * reais, already net. Not a trade: it changes neither the quantity nor the
 * cost, only the total gain. The id is also the order of entry.
 */
export type Payout = {
  id: number;
  asset: number;
  date: IsoDate;
  kind: PayoutKind;
  amount: Cents;
  /** The id of the origin it came from, on a payout the source brought; absent on one entered by hand. */
  origin?: number;
};

/** Without `id`, a new payout; with it, the correction of that one. */
export type PayoutToSave = Omit<Payout, "id" | "origin"> & { id?: number };

/**
 * A payout as the source announces it: the value per unit, an exact decimal,
 * for whoever held the asset at the end of the record date ("data-com"), paid
 * on the payment date.
 */
export type SourcePayout = { asset: number; kind: PayoutKind; recordDate: IsoDate; paymentDate: IsoDate; perUnit: Decimal };

/**
 * What identifies a payout the source brought: its asset, kind, record date
 * and payment date. Once seen, it is kept even after the payout is corrected
 * or deleted, so the source never writes it again.
 */
export type PayoutOrigin = Omit<SourcePayout, "perUnit"> & { id: number };

/** What is left of interest on equity after the 15% income tax withheld, in percent; dividends and fund income are exempt. */
const INTEREST_ON_EQUITY_NET = 85n;

/** From quantity × value per unit, both scaled to 8 places, to cents. */
const CENTS_SCALE = 1e14;

/** Creates the payout, or corrects any of its fields. Checks every field, because the command comes from the browser. */
export function savePayout(state: PortfolioState, data: PayoutToSave, today: IsoDate): Result<PortfolioState> {
  if (!PAYOUT_KINDS.includes(data?.kind)) return { ok: false, error: "Escolha o tipo do provento." };
  const existing = data.id === undefined ? null : state.payouts.find((p) => p.id === data.id);
  if (existing === undefined) return { ok: false, error: "Esse provento não existe." };
  if (!state.assets.some((a) => a.id === data.asset)) return { ok: false, error: "Esse ativo não existe." };
  if (typeof data.date !== "string" || !isValidDate(data.date)) return { ok: false, error: "Informe uma data válida." };
  if (data.date > today) return { ok: false, error: "O provento não pode ter data de pagamento depois de hoje." };
  if (!Number.isSafeInteger(data.amount)) return { ok: false, error: "Informe o valor do provento em centavos." };
  if (data.amount <= 0) return { ok: false, error: "O valor do provento tem que ser maior que zero." };

  const payout: Payout = {
    id: existing?.id ?? nextId(state.payouts),
    asset: data.asset,
    date: data.date,
    kind: data.kind,
    amount: data.amount,
    ...(existing?.origin !== undefined && { origin: existing.origin }),
  };
  const payouts = existing ? state.payouts.map((p) => (p.id === payout.id ? payout : p)) : [...state.payouts, payout];
  return { ok: true, value: { ...state, payouts } };
}

/** Deletes the payout for good: the portfolio has no trash. */
export function deletePayout(state: PortfolioState, id: number): Result<PortfolioState> {
  if (!state.payouts.some((p) => p.id === id)) return { ok: false, error: "Esse provento não existe." };
  return { ok: true, value: { ...state, payouts: state.payouts.filter((p) => p.id !== id) } };
}

/**
 * Records the payouts the source brought whose origin was never seen: only the
 * ones already paid, on the payment date, worth the quantity at the end of the
 * record date (counting that day's trades) × the value per unit, less 15% on
 * interest on equity, to the cent. A record date with no position, or one not
 * yet paid, is left unseen, so a retroactive buy or the payment date makes a
 * later fetch record it. A payout of an asset deleted meanwhile is dropped.
 * Checks every field, because the command crosses the server's boundary.
 */
export function recordSourcePayouts(state: PortfolioState, payouts: SourcePayout[], today: IsoDate): Result<PortfolioState> {
  if (!Array.isArray(payouts)) return { ok: false, error: "Informe os proventos." };
  for (const p of payouts) {
    if (!PAYOUT_KINDS.includes(p?.kind)) return { ok: false, error: "Escolha o tipo do provento." };
    for (const date of [p.recordDate, p.paymentDate]) {
      if (typeof date !== "string" || !isValidDate(date)) return { ok: false, error: "Informe uma data válida." };
    }
    if (!Number.isSafeInteger(p.perUnit) || p.perUnit <= 0) return { ok: false, error: "O valor por unidade tem que ser maior que zero." };
  }

  let next = state;
  for (const p of payouts) {
    if (p.paymentDate > today || !next.assets.some((a) => a.id === p.asset)) continue;
    if (next.payoutOrigins.some((o) => sameOrigin(o, p))) continue;
    const held = replay(next.trades.filter((t) => t.asset === p.asset && t.date <= p.recordDate)).position.quantity;
    // Multiplied exactly, before the only division.
    const gross = BigInt(held) * BigInt(p.perUnit);
    const amount = Math.round(
      p.kind === "interest-on-equity" ? Number(gross * INTEREST_ON_EQUITY_NET) / (CENTS_SCALE * 100) : Number(gross) / CENTS_SCALE,
    );
    if (amount <= 0) continue;

    const origin: PayoutOrigin = { id: nextId(next.payoutOrigins), asset: p.asset, kind: p.kind, recordDate: p.recordDate, paymentDate: p.paymentDate };
    const payout: Payout = { id: nextId(next.payouts), asset: p.asset, date: p.paymentDate, kind: p.kind, amount, origin: origin.id };
    next = { ...next, payouts: [...next.payouts, payout], payoutOrigins: [...next.payoutOrigins, origin] };
  }
  return { ok: true, value: next };
}

const sameOrigin = (o: PayoutOrigin, p: SourcePayout) =>
  o.asset === p.asset && o.kind === p.kind && o.recordDate === p.recordDate && o.paymentDate === p.paymentDate;
