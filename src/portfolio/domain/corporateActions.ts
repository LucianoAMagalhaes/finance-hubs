import { isValidDate, type IsoDate, type Result } from "@/shared";
import type { AssetClass } from "./classes";
import { replay } from "./position";
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
 * Only a confirmed action counts. A pending one waits for the person, and a
 * dismissed one is kept only so the source never proposes it again.
 */
export type CorporateActionStatus = "pending" | "confirmed" | "dismissed";

/**
 * A change the company or the fund makes to the number of units of an asset.
 * Not a trade, but it counts in date order with them, before the trades of
 * its own date: it multiplies the quantity by the ratio and keeps the cost, so
 * the average price adjusts by itself. The id is also the order of entry.
 */
export type CorporateAction = {
  id: number;
  asset: number;
  kind: CorporateActionKind;
  date: IsoDate;
  ratio: Ratio;
  status: CorporateActionStatus;
  /** The source's proposal it came from, kept after a correction; absent on one entered by hand. */
  origin?: string;
};

/** Without `id`, a new action; with it, the correction of that one, on the same asset. */
export type CorporateActionToSave = Omit<CorporateAction, "id" | "status" | "origin"> & { id?: number };

/** An action as the source proposes it: from its date on, the quantity becomes `quantity × to ÷ from`. */
export type SourceCorporateAction = Omit<CorporateAction, "id" | "status" | "origin">;

/** Whether the class's assets have corporate actions: only Ações Nacionais, Ações Internacionais and FIIs. */
export const hasCorporateActions = (assetClass: AssetClass) =>
  assetClass === "domestic-stocks" || assetClass === "international-stocks" || assetClass === "real-estate-funds";

/**
 * Creates the action, or corrects its date, kind and ratio. Checks every
 * field, because the command comes from the browser, and refuses what would
 * leave a later sale uncovered, like a trade.
 */
export function saveCorporateAction(state: PortfolioState, data: CorporateActionToSave, today: IsoDate): Result<PortfolioState> {
  const error = checkFields(data);
  if (error) return { ok: false, error };
  const existing = data.id === undefined ? null : visible(state, data.id);
  if (existing === undefined) return { ok: false, error: "Esse evento não existe." };
  if (existing?.status === "pending") return { ok: false, error: PENDING_FIRST };
  const asset = state.assets.find((a) => a.id === data.asset);
  if (!asset) return { ok: false, error: "Esse ativo não existe." };
  if (existing && existing.asset !== asset.id) return { ok: false, error: "O ativo de um evento não muda." };
  if (!hasCorporateActions(asset.assetClass)) {
    return { ok: false, error: "Evento corporativo só existe em Ações Nacionais, Ações Internacionais e FIIs." };
  }
  if (data.date > today) return { ok: false, error: "O evento não pode ter data depois de hoje." };
  const { from, to } = data.ratio;

  const action: CorporateAction = {
    id: existing?.id ?? nextId(state.corporateActions),
    asset: asset.id,
    kind: data.kind,
    date: data.date,
    ratio: { from, to },
    status: "confirmed",
    ...(existing?.origin !== undefined && { origin: existing.origin }),
  };
  const corporateActions = existing
    ? state.corporateActions.map((c) => (c.id === action.id ? action : c))
    : [...state.corporateActions, action];
  const next = { ...state, corporateActions };
  const uncovered = whyUncovered(next, [asset.id], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/**
 * Deletes the action for good, unless a later sale would be left uncovered.
 * Deleting isn't dismissing: one that came from the source is proposed again.
 */
export function deleteCorporateAction(state: PortfolioState, id: number): Result<PortfolioState> {
  const deleted = visible(state, id);
  if (!deleted) return { ok: false, error: "Esse evento não existe." };
  if (deleted.status === "pending") return { ok: false, error: PENDING_FIRST };
  const next = { ...state, corporateActions: state.corporateActions.filter((c) => c.id !== id) };
  const uncovered = whyUncovered(next, [deleted.asset], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/** Confirms a pending action, which from then on counts as one entered by hand, with the same lock. */
export function confirmCorporateAction(state: PortfolioState, id: number): Result<PortfolioState> {
  const pending = pendingAction(state, id);
  if (!pending.ok) return pending;
  const next = { ...state, corporateActions: state.corporateActions.map((c) => (c.id === id ? { ...c, status: "confirmed" as const } : c)) };
  const uncovered = whyUncovered(next, [pending.value.asset], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/** Dismisses a pending action: it never counts, and the source never proposes it again. */
export function dismissCorporateAction(state: PortfolioState, id: number): Result<PortfolioState> {
  const pending = pendingAction(state, id);
  if (!pending.ok) return pending;
  return { ok: true, value: { ...state, corporateActions: state.corporateActions.map((c) => (c.id === id ? { ...c, status: "dismissed" as const } : c)) } };
}

/**
 * Proposes, as pending, each action the source brought whose origin the
 * asset doesn't have: only up to today, of an asset that has corporate
 * actions, and on a date with a position greater than zero at the end of the
 * day before (counting the confirmed actions). An action left out stays
 * unseen, so a retroactive buy makes a later fetch propose an old one. A
 * confirmed, corrected or dismissed one keeps its origin, so the source never
 * touches it again; a deleted one is proposed again. One the person entered
 * by hand on the same date with the same ratio is taken as the same action,
 * and none is proposed. Checks every field,
 * because the command crosses the server's boundary.
 */
export function recordSourceCorporateActions(state: PortfolioState, actions: SourceCorporateAction[], today: IsoDate): Result<PortfolioState> {
  if (!Array.isArray(actions)) return { ok: false, error: "Informe os eventos." };
  for (const a of actions) {
    const error = checkFields(a);
    if (error) return { ok: false, error };
  }

  let next = state;
  for (const a of actions) {
    const asset = next.assets.find((x) => x.id === a.asset);
    if (a.date > today || !asset || !hasCorporateActions(asset.assetClass)) continue;
    const origin = originOf(a);
    if (next.corporateActions.some((c) => c.asset === a.asset && (c.origin === origin || isTypedTwin(c, a)))) continue;
    const held = replay(
      next.trades.filter((t) => t.asset === a.asset && t.date < a.date),
      next.corporateActions.filter((c) => c.asset === a.asset && c.date < a.date),
    ).position.quantity;
    if (held <= 0) continue;

    const action: CorporateAction = {
      id: nextId(next.corporateActions),
      asset: a.asset,
      kind: a.kind,
      date: a.date,
      ratio: { from: a.ratio.from, to: a.ratio.to },
      status: "pending",
      origin,
    };
    next = { ...next, corporateActions: [...next.corporateActions, action] };
  }
  return { ok: true, value: next };
}

/** What identifies the source's proposal within its asset: its date and its ratio, as it first came. */
const originOf = ({ date, ratio }: SourceCorporateAction) => `${date} ${ratio.from}:${ratio.to}`;

/** One the person entered by hand on the same date with the same ratio: the source would apply it twice. */
const isTypedTwin = (c: CorporateAction, a: SourceCorporateAction) =>
  c.origin === undefined && c.date === a.date && c.ratio.from === a.ratio.from && c.ratio.to === a.ratio.to;

/** The action the person sees: a dismissed one no longer exists for them. */
const visible = (state: PortfolioState, id: number | undefined) => state.corporateActions.find((c) => c.id === id && c.status !== "dismissed");

function pendingAction(state: PortfolioState, id: number): Result<CorporateAction> {
  const action = visible(state, id);
  if (!action) return { ok: false, error: "Esse evento não existe." };
  if (action.status !== "pending") return { ok: false, error: "Esse evento não está pendente." };
  return { ok: true, value: action };
}

/** The kind, date and ratio of an action, whether typed or brought by the source. */
function checkFields(data: { kind: CorporateActionKind; date: unknown; ratio: unknown }): string | null {
  if (!CORPORATE_ACTION_KINDS.includes(data?.kind)) return "Escolha desdobramento, grupamento ou bonificação.";
  if (typeof data.date !== "string" || !isValidDate(data.date)) return "Informe uma data válida.";
  const { from, to } = (data.ratio ?? {}) as Partial<Ratio>;
  if (!isPositiveInteger(from) || !isPositiveInteger(to)) return "A proporção tem que ter dois números inteiros maiores que zero.";
  if (from === to) return `Uma proporção de ${from} para ${to} não muda a quantidade.`;
  return null;
}

const PENDING_FIRST = "Confirme ou descarte o evento pendente primeiro.";

const isPositiveInteger = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;
