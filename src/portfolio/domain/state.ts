import type { Asset } from "./assets";
import { DEFAULT_TARGETS, type Targets } from "./classes";
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
};

/** The portfolio of the first use: the default targets and no asset. */
export function emptyPortfolio(): PortfolioState {
  return { targets: { ...DEFAULT_TARGETS }, assets: [], trades: [] };
}

export const nextId = (list: { id: number }[]) => Math.max(0, ...list.map((r) => r.id)) + 1;
