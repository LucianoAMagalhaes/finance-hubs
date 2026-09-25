import { centsToField, reaisToCents, type IsoDate, type Payout, type PayoutKind, type PayoutToSave } from "@/portfolio/domain";

/** What is written in each field of the payout's sheet, as the person typed it; `id` is the payout being corrected. */
export type PayoutDraft = { id: number | null; asset: string; kind: PayoutKind; date: string; amount: string };

/** A new dividend: today, and the asset whose row it was opened from, if any. */
export function emptyPayoutDraft(today: IsoDate, asset: number | null): PayoutDraft {
  return { id: null, asset: asset === null ? "" : String(asset), kind: "dividend", date: today, amount: "" };
}

/** A saved payout, as the person would have typed it, to be corrected. */
export function payoutDraftFrom(p: Payout): PayoutDraft {
  return { id: p.id, asset: String(p.asset), kind: p.kind, date: p.date, amount: centsToField(p.amount) };
}

/**
 * What the sheet sends: the payout as the person wrote it, and what the
 * browser already knows it cannot read. The rest (positive, date, asset that
 * exists) is the domain's to refuse.
 */
export type CheckedPayoutDraft = { payout: PayoutToSave; error: string | null };

export function checkPayoutDraft(draft: PayoutDraft): CheckedPayoutDraft {
  const amount = reaisToCents(draft.amount);
  const error = draft.asset === "" ? "Escolha o ativo." : amount === null ? "Informe o valor recebido em reais, como 54,12." : null;
  const payout: PayoutToSave = { asset: Number(draft.asset), kind: draft.kind, date: draft.date as IsoDate, amount: amount ?? 0 };
  return { payout: draft.id === null ? payout : { id: draft.id, ...payout }, error };
}
