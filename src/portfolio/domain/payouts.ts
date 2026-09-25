import { isValidDate, type Cents, type IsoDate, type Result } from "@/shared";
import { nextId, type PortfolioState } from "./state";

export const PAYOUT_KINDS = ["dividend", "interest-on-equity", "fund-income", "interest"] as const;

/** Only informative: it changes nothing in the numbers. */
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

/**
 * Money an asset paid the person: the payment date and the amount received in
 * reais, already net. Not a trade: it changes neither the quantity nor the
 * cost, only the total gain. The id is also the order of entry.
 */
export type Payout = { id: number; asset: number; date: IsoDate; kind: PayoutKind; amount: Cents };

/** Without `id`, a new payout; with it, the correction of that one. */
export type PayoutToSave = Omit<Payout, "id"> & { id?: number };

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
  };
  const payouts = existing ? state.payouts.map((p) => (p.id === payout.id ? payout : p)) : [...state.payouts, payout];
  return { ok: true, value: { ...state, payouts } };
}

/** Deletes the payout for good: the portfolio has no trash. */
export function deletePayout(state: PortfolioState, id: number): Result<PortfolioState> {
  if (!state.payouts.some((p) => p.id === id)) return { ok: false, error: "Esse provento não existe." };
  return { ok: true, value: { ...state, payouts: state.payouts.filter((p) => p.id !== id) } };
}
