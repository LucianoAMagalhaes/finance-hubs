import { formatDate, isValidDate, type IsoDate, type Result } from "@/shared";
import { decimalToField, type Decimal } from "./decimal";
import { checkExchangeRate, currencyOf, type ExchangeRate } from "./exchangeRate";
import { replay } from "./position";
import { nextId, type PortfolioState } from "./state";

export type TradeKind = "buy" | "sell";

/**
 * A buy or a sale of an asset: date, quantity and unit price in the asset's
 * currency, both exact decimals. No fee field: the price is what was paid or
 * received. A trade in dollars also keeps the exchange rate of the trade,
 * which says how much it was worth in reais; it is null in reais. The id is
 * also the order of entry, which orders trades on the same date.
 */
export type Trade = {
  id: number;
  asset: number;
  kind: TradeKind;
  date: IsoDate;
  quantity: Decimal;
  unitPrice: Decimal;
  exchangeRate: ExchangeRate | null;
};

/**
 * Without `id`, a new trade; with it, the correction of that one, which keeps
 * its place in the order of entry. A trade in reais may leave the rate out.
 */
export type TradeToSave = Omit<Trade, "id" | "exchangeRate"> & { id?: number; exchangeRate?: ExchangeRate | null };

/**
 * Creates the trade, or corrects any of its fields. Checks every field,
 * because the command comes from the browser, and refuses what would make the
 * quantity negative on any date. A trade in dollars without its exchange rate
 * is refused; the rate is only ever changed here, by the person.
 */
export function saveTrade(state: PortfolioState, data: TradeToSave, today: IsoDate): Result<PortfolioState> {
  if (data?.kind !== "buy" && data?.kind !== "sell") return { ok: false, error: "Escolha compra ou venda." };
  const existing = data.id === undefined ? null : state.trades.find((t) => t.id === data.id);
  if (existing === undefined) return { ok: false, error: "Essa operação não existe." };
  const asset = state.assets.find((a) => a.id === data.asset);
  if (!asset) return { ok: false, error: "Esse ativo não existe." };
  if (typeof data.date !== "string" || !isValidDate(data.date)) return { ok: false, error: "Informe uma data válida." };
  if (data.date > today) return { ok: false, error: "A operação não pode ter data depois de hoje." };
  const error = checkPositive(data.quantity, "A quantidade") ?? checkPositive(data.unitPrice, "O preço unitário");
  if (error) return { ok: false, error };
  const exchangeRate = data.exchangeRate ?? null;
  if (currencyOf(asset.assetClass) === "USD") {
    if (exchangeRate === null) return { ok: false, error: "Informe o câmbio da operação em dólar." };
    const rateError = checkExchangeRate(exchangeRate, "O câmbio");
    if (rateError) return { ok: false, error: rateError };
  } else if (exchangeRate !== null) {
    return { ok: false, error: "Só a operação em dólar tem câmbio." };
  }

  const trade: Trade = {
    id: existing?.id ?? nextId(state.trades),
    asset: data.asset,
    kind: data.kind,
    date: data.date,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
    exchangeRate,
  };
  const trades = existing ? state.trades.map((t) => (t.id === trade.id ? trade : t)) : [...state.trades, trade];
  const next = { ...state, trades };
  const uncovered = whyUncovered(next, [trade.asset, existing?.asset], trade.id);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/** Deletes the trade for good, unless a later sale would be left uncovered. */
export function deleteTrade(state: PortfolioState, id: number): Result<PortfolioState> {
  const deleted = state.trades.find((t) => t.id === id);
  if (!deleted) return { ok: false, error: "Essa operação não existe." };
  const next = { ...state, trades: state.trades.filter((t) => t.id !== id) };
  const uncovered = whyUncovered(next, [deleted.asset], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/**
 * Why the state's trades and corporate actions would leave one of the assets
 * with a negative quantity, or null if they don't. The sale being saved is
 * told what there was on its date; any other sale is the one that would be
 * left uncovered.
 */
export function whyUncovered(state: PortfolioState, assets: (number | undefined)[], saved: number | null): string | null {
  for (const id of new Set(assets)) {
    const { uncovered } = replay(
      state.trades.filter((t) => t.asset === id),
      state.corporateActions.filter((c) => c.asset === id),
    );
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
