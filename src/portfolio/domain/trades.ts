import { formatDate, isValidDate, type IsoDate, type Result } from "@/shared";
import { decimalToField, type Decimal } from "./decimal";
import { replay } from "./position";
import { nextId, type PortfolioState } from "./state";

export type TradeKind = "buy" | "sell";

/**
 * A buy or a sale of an asset: date, quantity and unit price in the asset's
 * currency, both exact decimals. No fee field: the price is what was paid or
 * received. The id is also the order of entry, which orders trades on the
 * same date.
 */
export type Trade = { id: number; asset: number; kind: TradeKind; date: IsoDate; quantity: Decimal; unitPrice: Decimal };

/** Without `id`, a new trade; with it, the correction of that one, which keeps its place in the order of entry. */
export type TradeToSave = Omit<Trade, "id"> & { id?: number };

/**
 * Creates the trade, or corrects any of its fields. Checks every field,
 * because the command comes from the browser, and refuses what would make the
 * quantity negative on any date.
 */
export function saveTrade(state: PortfolioState, data: TradeToSave, today: IsoDate): Result<PortfolioState> {
  if (data?.kind !== "buy" && data?.kind !== "sell") return { ok: false, error: "Escolha compra ou venda." };
  const existing = data.id === undefined ? null : state.trades.find((t) => t.id === data.id);
  if (existing === undefined) return { ok: false, error: "Essa operação não existe." };
  if (!state.assets.some((a) => a.id === data.asset)) return { ok: false, error: "Esse ativo não existe." };
  if (typeof data.date !== "string" || !isValidDate(data.date)) return { ok: false, error: "Informe uma data válida." };
  if (data.date > today) return { ok: false, error: "A operação não pode ter data depois de hoje." };
  const error = checkPositive(data.quantity, "A quantidade") ?? checkPositive(data.unitPrice, "O preço unitário");
  if (error) return { ok: false, error };

  const trade: Trade = {
    id: existing?.id ?? nextId(state.trades),
    asset: data.asset,
    kind: data.kind,
    date: data.date,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
  };
  const trades = existing ? state.trades.map((t) => (t.id === trade.id ? trade : t)) : [...state.trades, trade];
  const uncovered = whyUncovered(state, trades, [trade.asset, existing?.asset], trade.id);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: { ...state, trades } };
}

/** Deletes the trade for good, unless a later sale would be left uncovered. */
export function deleteTrade(state: PortfolioState, id: number): Result<PortfolioState> {
  const deleted = state.trades.find((t) => t.id === id);
  if (!deleted) return { ok: false, error: "Essa operação não existe." };
  const trades = state.trades.filter((t) => t.id !== id);
  const uncovered = whyUncovered(state, trades, [deleted.asset], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: { ...state, trades } };
}

/**
 * Why the trades would leave one of the assets with a negative quantity, or
 * null if they don't. The sale being saved is told what there was on its
 * date; any other sale is the one that would be left uncovered.
 */
function whyUncovered(state: PortfolioState, trades: Trade[], assets: (number | undefined)[], saved: number | null): string | null {
  for (const id of new Set(assets)) {
    const { uncovered } = replay(trades.filter((t) => t.asset === id));
    if (!uncovered) continue;
    const ticker = state.assets.find((a) => a.id === id)?.ticker;
    const date = formatDate(uncovered.sale.date);
    if (uncovered.sale.id !== saved) return `Isso deixaria sem cobertura a venda de ${ticker} de ${date}.`;
    if (uncovered.available === 0) return `Em ${date} não havia ${ticker} para vender.`;
    return `Em ${date} havia só ${decimalToField(uncovered.available)} ${ticker} para vender.`;
  }
  return null;
}

function checkPositive(value: Decimal, name: string): string | null {
  if (!Number.isSafeInteger(value)) return `${name} aceita até 8 casas decimais.`;
  if (value <= 0) return `${name} tem que ser maior que zero.`;
  return null;
}
