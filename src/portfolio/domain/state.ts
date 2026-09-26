import type { Asset } from "./assets";
import { DEFAULT_TARGETS, type Targets } from "./classes";
import type { CurrentExchangeRate } from "./exchangeRate";
import type { Payout, PayoutOrigin } from "./payouts";
import type { LastFetch, Quote } from "./quotes";
import type { Trade } from "./trades";

/**
 * Everything the portfolio stores. What is derived (position, value, gain,
 * share of each class) never goes in here: `projectPortfolio` computes it.
 */
export type PortfolioState = {
  /** Only the current targets: changing one keeps no history. */
  targets: Targets;
  assets: Asset[];
  trades: Trade[];
  payouts: Payout[];
  /** The origin of every payout the source brought, kept after the payout is corrected or deleted. */
  payoutOrigins: PayoutOrigin[];
  /** The last quote of each asset that ever had one. */
  quotes: Quote[];
  /** The last current exchange rate; null while there never was one. */
  exchangeRate: CurrentExchangeRate | null;
  lastFetch: LastFetch;
};

/** The portfolio of the first use: the default targets and no asset. */
export function emptyPortfolio(): PortfolioState {
  return { targets: { ...DEFAULT_TARGETS }, assets: [], trades: [], payouts: [], payoutOrigins: [], quotes: [], exchangeRate: null, lastFetch: {} };
}

export const nextId = (list: { id: number }[]) => Math.max(0, ...list.map((r) => r.id)) + 1;
