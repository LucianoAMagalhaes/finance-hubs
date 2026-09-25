import type { Cents, IsoDate } from "@/shared";
import { ASSET_CLASSES, type AssetClass } from "./classes";
import type { PortfolioState } from "./state";

// Every amount here is in reais, in cents, and may carry a fraction of a cent:
// it is only rounded for display, like the budget's limits.

/** A class as the dashboard shows it: its card, its slice of the bars and its detail's header. */
export type ClassView = {
  key: AssetClass;
  name: string;
  /** The current value of the class's assets. */
  value: Cents;
  /** The class's share of the portfolio's current value, from 0 to 100; 0 while the portfolio is worth nothing. */
  share: number;
  target: number;
  /** How much the class is below its target's value (`target × portfolio value − value`); negative when above. */
  toTarget: Cents;
  totalGain: Cents;
  /** How many assets the class has, with or without position. */
  assetCount: number;
};

/** The whole snapshot, derived and never stored, that feeds the screen. */
export type PortfolioView = {
  currentValue: Cents;
  cost: Cents;
  totalGain: Cents;
  /** How much of the total gain came from payouts. */
  payouts: Cents;
  classes: ClassView[];
};

export function projectPortfolio(state: PortfolioState, today: IsoDate): PortfolioView {
  void today; // Nothing is dated yet; quotes and positions will be.
  // No asset exists yet: every class is worth nothing.
  const values = Object.fromEntries(ASSET_CLASSES.map((c) => [c.id, 0])) as Record<AssetClass, Cents>;
  const currentValue = ASSET_CLASSES.reduce((sum, c) => sum + values[c.id], 0);
  const classes = ASSET_CLASSES.map(({ id, name }): ClassView => {
    const value = values[id];
    const target = state.targets[id];
    return {
      key: id,
      name,
      value,
      share: currentValue > 0 ? (value / currentValue) * 100 : 0,
      target,
      toTarget: (target / 100) * currentValue - value,
      totalGain: 0,
      assetCount: 0,
    };
  });
  return { currentValue, cost: 0, totalGain: 0, payouts: 0, classes };
}
