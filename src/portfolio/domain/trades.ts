import { isValidDate, type IsoDate, type Result } from "@/shared";
import type { Decimal } from "./decimal";
import { nextId, type PortfolioState } from "./state";

/** Sells arrive with their own ticket. */
export type TradeKind = "buy";

/**
 * A buy of an asset: date, quantity and unit price in the asset's currency,
 * both exact decimals. No fee field: the price is what was paid. The id is
 * also the order of entry, which orders trades on the same date.
 */
export type Trade = { id: number; asset: number; kind: TradeKind; date: IsoDate; quantity: Decimal; unitPrice: Decimal };

/** A new trade; correcting one arrives with its own ticket. */
export type TradeToSave = Omit<Trade, "id">;

/** Checks every field, because the command comes from the browser. */
export function saveTrade(state: PortfolioState, data: TradeToSave, today: IsoDate): Result<PortfolioState> {
  if (data?.kind !== "buy") return { ok: false, error: "Por enquanto, só compras." };
  if (!state.assets.some((a) => a.id === data.asset)) return { ok: false, error: "Esse ativo não existe." };
  if (typeof data.date !== "string" || !isValidDate(data.date)) return { ok: false, error: "Informe uma data válida." };
  if (data.date > today) return { ok: false, error: "A operação não pode ter data depois de hoje." };
  const error = checkPositive(data.quantity, "A quantidade") ?? checkPositive(data.unitPrice, "O preço unitário");
  if (error) return { ok: false, error };

  const trade: Trade = {
    id: nextId(state.trades),
    asset: data.asset,
    kind: data.kind,
    date: data.date,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
  };
  return { ok: true, value: { ...state, trades: [...state.trades, trade] } };
}

function checkPositive(value: Decimal, name: string): string | null {
  if (!Number.isSafeInteger(value)) return `${name} aceita até 8 casas decimais.`;
  if (value <= 0) return `${name} tem que ser maior que zero.`;
  return null;
}
