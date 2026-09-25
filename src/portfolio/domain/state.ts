import { DEFAULT_TARGETS, type Targets } from "./classes";

/**
 * Everything the portfolio stores. What is derived (position, value, gain,
 * share of each class) never goes in here: `projectPortfolio` computes it.
 */
export type PortfolioState = {
  /** Only the current targets: changing one keeps no history. */
  targets: Targets;
};

/** The portfolio of the first use: the default targets and no asset. */
export function emptyPortfolio(): PortfolioState {
  return { targets: { ...DEFAULT_TARGETS } };
}
