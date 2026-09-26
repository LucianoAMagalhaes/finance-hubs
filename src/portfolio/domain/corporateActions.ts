import { isValidDate, type IsoDate, type Result } from "@/shared";
import type { AssetClass } from "./classes";
import { nextId, type PortfolioState } from "./state";
import { whyUncovered } from "./trades";

export const CORPORATE_ACTION_KINDS = ["split", "reverse-split", "bonus"] as const;

/** Only informative: the ratio alone says what happens to the quantity. */
export type CorporateActionKind = (typeof CORPORATE_ACTION_KINDS)[number];

/**
 * The quantity becomes `quantity × to ÷ from`: a split "1 para 4" is 1 → 4, a
 * reverse split "10 para 1" is 10 → 1, and a bonus "1 nova para cada 10" is
 * 10 → 11. Two integers greater than zero.
 */
export type Ratio = { from: number; to: number };

/**
 * A change the company or the fund makes to the number of units of an asset.
 * Not a trade, but it counts in date order with them, before the trades of
 * its own date: it multiplies the quantity by the ratio and keeps the cost, so
 * the average price adjusts by itself. The id is also the order of entry.
 */
export type CorporateAction = { id: number; asset: number; kind: CorporateActionKind; date: IsoDate; ratio: Ratio };

/** Without `id`, a new action; with it, the correction of that one, on the same asset. */
export type CorporateActionToSave = Omit<CorporateAction, "id"> & { id?: number };

/** Whether the class's assets have corporate actions: only Ações Nacionais, Ações Internacionais and FIIs. */
export const hasCorporateActions = (assetClass: AssetClass) =>
  assetClass === "domestic-stocks" || assetClass === "international-stocks" || assetClass === "real-estate-funds";

/**
 * Creates the action, or corrects its date, kind and ratio. Checks every
 * field, because the command comes from the browser, and refuses what would
 * leave a later sale uncovered, like a trade.
 */
export function saveCorporateAction(state: PortfolioState, data: CorporateActionToSave, today: IsoDate): Result<PortfolioState> {
  if (!CORPORATE_ACTION_KINDS.includes(data?.kind)) return { ok: false, error: "Escolha desdobramento, grupamento ou bonificação." };
  const existing = data.id === undefined ? null : state.corporateActions.find((c) => c.id === data.id);
  if (existing === undefined) return { ok: false, error: "Esse evento não existe." };
  const asset = state.assets.find((a) => a.id === data.asset);
  if (!asset) return { ok: false, error: "Esse ativo não existe." };
  if (existing && existing.asset !== asset.id) return { ok: false, error: "O ativo de um evento não muda." };
  if (!hasCorporateActions(asset.assetClass)) {
    return { ok: false, error: "Evento corporativo só existe em Ações Nacionais, Ações Internacionais e FIIs." };
  }
  if (typeof data.date !== "string" || !isValidDate(data.date)) return { ok: false, error: "Informe uma data válida." };
  if (data.date > today) return { ok: false, error: "O evento não pode ter data depois de hoje." };
  const { from, to } = data.ratio ?? {};
  if (!isPositiveInteger(from) || !isPositiveInteger(to)) {
    return { ok: false, error: "A proporção tem que ter dois números inteiros maiores que zero." };
  }
  if (from === to) return { ok: false, error: `Uma proporção de ${from} para ${to} não muda a quantidade.` };

  const action: CorporateAction = { id: existing?.id ?? nextId(state.corporateActions), asset: asset.id, kind: data.kind, date: data.date, ratio: { from, to } };
  const corporateActions = existing
    ? state.corporateActions.map((c) => (c.id === action.id ? action : c))
    : [...state.corporateActions, action];
  const next = { ...state, corporateActions };
  const uncovered = whyUncovered(next, [asset.id], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/** Deletes the action for good, unless a later sale would be left uncovered. */
export function deleteCorporateAction(state: PortfolioState, id: number): Result<PortfolioState> {
  const deleted = state.corporateActions.find((c) => c.id === id);
  if (!deleted) return { ok: false, error: "Esse evento não existe." };
  const next = { ...state, corporateActions: state.corporateActions.filter((c) => c.id !== id) };
  const uncovered = whyUncovered(next, [deleted.asset], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

const isPositiveInteger = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;
