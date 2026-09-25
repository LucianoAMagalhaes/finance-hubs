import { isValidDateTime, type IsoDateTime, type Result } from "@/shared";
import type { Decimal } from "./decimal";
import { checkCurrentExchangeRate, type CurrentExchangeRate } from "./exchangeRate";
import type { PortfolioState } from "./state";

/**
 * The price of one unit of an asset, in the asset's currency, brought by a
 * source with the time it was obtained. Only the last one of each asset is
 * kept, and it keeps counting when the source fails. An exact decimal, like the
 * unit price: a crypto can cost less than a cent.
 */
export type Quote = { asset: number; price: Decimal; at: IsoDateTime };

export type QuoteToRecord = Quote;

/** What the portfolio fetches from outside. Each kind arrives with the ticket that fetches it. */
export type FetchKind = "quotes";

/** The time of the last successful fetch of each kind; a kind never fetched is absent. */
export type LastFetch = Partial<Record<FetchKind, IsoDateTime>>;

/**
 * Keeps each quote as its asset's last one, and the current exchange rate, when
 * one came, as the last rate. A quote of an asset deleted while the sources
 * were asked is dropped. Checks every field, because the command crosses the
 * server's boundary.
 */
export function recordQuotes(
  state: PortfolioState,
  quotes: QuoteToRecord[],
  exchangeRate: CurrentExchangeRate | undefined,
): Result<PortfolioState> {
  if (!Array.isArray(quotes)) return { ok: false, error: "Informe as cotações." };
  for (const q of quotes) {
    if (!Number.isSafeInteger(q?.price)) return { ok: false, error: "A cotação aceita até 8 casas decimais." };
    if (q.price <= 0) return { ok: false, error: "A cotação tem que ser maior que zero." };
    if (typeof q.at !== "string" || !isValidDateTime(q.at)) return { ok: false, error: "A cotação precisa da hora em que foi obtida." };
  }
  const rate = exchangeRate === undefined ? null : checkCurrentExchangeRate(exchangeRate);
  if (rate && !rate.ok) return rate;
  const recorded = quotes.filter((q) => state.assets.some((a) => a.id === q.asset));
  const kept = state.quotes.filter((q) => !recorded.some((r) => r.asset === q.asset));
  const next = [...kept, ...recorded.map(({ asset, price, at }) => ({ asset, price, at }))].sort((a, b) => a.asset - b.asset);
  return { ok: true, value: { ...state, quotes: next, exchangeRate: rate ? rate.value : state.exchangeRate } };
}

/** Records the time of the last successful fetch of that kind. */
export function recordFetch(state: PortfolioState, kind: FetchKind, at: IsoDateTime): Result<PortfolioState> {
  if (kind !== "quotes") return { ok: false, error: "Não sei que busca é essa." };
  if (typeof at !== "string" || !isValidDateTime(at)) return { ok: false, error: "Informe a hora da busca." };
  return { ok: true, value: { ...state, lastFetch: { ...state.lastFetch, [kind]: at } } };
}
