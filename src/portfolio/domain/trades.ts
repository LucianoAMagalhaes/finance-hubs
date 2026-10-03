import { formatDate, isValidDate, type Cents, type IsoDate, type Result } from "@/shared";
import { decimalToField, type Decimal } from "./decimal";
import { checkExchangeRate, currencyOf, type ExchangeRate } from "./exchangeRate";
import { isPrivateBond } from "./bonds";
import { replay } from "./position";
import { tradesInUnits, whyUnrepresentableApplication } from "./privateBonds";
import { nextId, type PortfolioState } from "./state";

export type TradeKind = "buy" | "sell";

/** The id is also the order of entry, which orders trades on the same date. */
type TradeBase = { id: number; asset: number; kind: TradeKind; date: IsoDate };

/**
 * A buy or a sale of an asset: date, quantity and unit price in the asset's
 * currency, both exact decimals. No fee field: the price is what was paid or
 * received. A trade in dollars also keeps the exchange rate of the trade,
 * which says how much it was worth in reais; it is null in reais.
 */
export type UnitTrade = TradeBase & { quantity: Decimal; unitPrice: Decimal; exchangeRate: ExchangeRate | null };

/**
 * An application in a private bond, recorded in reais as the bank's statement
 * says it, with no quantity nor unit price: the shares are always derived
 * from the amount and the accrued price of the date.
 */
export type AmountTrade = TradeBase & { amount: Cents };

/** A private bond's trades are in reais; every other asset's, in units. */
export type Trade = UnitTrade | AmountTrade;

/**
 * Without `id`, a new trade; with it, the correction of that one, which keeps
 * its place in the order of entry. A trade in reais may leave the rate out.
 */
export type TradeToSave =
  | (Omit<UnitTrade, "id" | "exchangeRate"> & { id?: number; exchangeRate?: ExchangeRate | null })
  | (Omit<AmountTrade, "id"> & { id?: number });

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
  const fields = isPrivateBond(asset) ? amountFields(data) : unitFields(data, currencyOf(asset.assetClass) === "USD");
  if ("error" in fields) return { ok: false, error: fields.error };

  const trade: Trade = { id: existing?.id ?? nextId(state.trades), asset: data.asset, kind: data.kind, date: data.date, ...fields };
  const trades = existing ? state.trades.map((t) => (t.id === trade.id ? trade : t)) : [...state.trades, trade];
  const next = { ...state, trades };
  const unrepresentable = whyUnrepresentableApplication(next, trade.asset);
  if (unrepresentable) return { ok: false, error: unrepresentable };
  const uncovered = whyUncovered(next, [trade.asset, existing?.asset], trade.id);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/** A private bond's application: its amount in reais, and neither quantity nor price. */
function amountFields(data: TradeToSave): { amount: Cents } | { error: string } {
  const { amount, quantity, unitPrice, exchangeRate } = data as Partial<AmountTrade & UnitTrade>;
  if (quantity !== undefined || unitPrice !== undefined || (exchangeRate ?? null) !== null) {
    return { error: "O título privado recebe o valor em reais, sem quantidade nem preço." };
  }
  if (data.kind === "sell") return { error: "O resgate de título privado ainda não existe." };
  if (!Number.isSafeInteger(amount)) return { error: "O valor aceita até 2 casas decimais." };
  if (amount! <= 0) return { error: "O valor tem que ser maior que zero." };
  return { amount: amount! };
}

/** Any other asset's trade: quantity and unit price, and in dollars the exchange rate. */
function unitFields(data: TradeToSave, dollar: boolean): Omit<UnitTrade, keyof TradeBase> | { error: string } {
  if ("amount" in data) return { error: "Só o título privado recebe o valor em reais." };
  const error = checkPositive(data.quantity, "A quantidade") ?? checkPositive(data.unitPrice, "O preço unitário");
  if (error) return { error };
  const exchangeRate = data.exchangeRate ?? null;
  if (dollar) {
    if (exchangeRate === null) return { error: "Informe o câmbio da operação em dólar." };
    const rateError = checkExchangeRate(exchangeRate, "O câmbio");
    if (rateError) return { error: rateError };
  } else if (exchangeRate !== null) {
    return { error: "Só a operação em dólar tem câmbio." };
  }
  return { quantity: data.quantity, unitPrice: data.unitPrice, exchangeRate };
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
    if (id === undefined) continue;
    const { uncovered } = replay(
      tradesInUnits(state, id),
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
