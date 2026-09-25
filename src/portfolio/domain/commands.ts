import type { IsoDate, Result } from "@/shared";
import { saveAsset, type AssetToSave } from "./assets";
import { validateTargets, type Targets } from "./classes";
import type { PortfolioState } from "./state";
import { saveTrade, type TradeToSave } from "./trades";

/**
 * Everything the person can ask of the portfolio. Each command arrives with the ticket that uses it.
 */
export type PortfolioCommand =
  | { type: "save-targets"; targets: Targets }
  | { type: "save-asset"; asset: AssetToSave }
  | { type: "save-trade"; trade: TradeToSave };

/**
 * Applies a command and returns the new state or the refusal, in Portuguese.
 * Pure: never changes the state it receives, and `today` comes from outside so
 * the domain doesn't read the clock.
 */
export function apply(state: PortfolioState, command: PortfolioCommand, today: IsoDate): Result<PortfolioState> {
  switch (command?.type) {
    case "save-targets": {
      const error = validateTargets(command.targets);
      if (error) return { ok: false, error };
      return { ok: true, value: { ...state, targets: { ...command.targets } } };
    }
    case "save-asset":
      return saveAsset(state, command.asset);
    case "save-trade":
      return saveTrade(state, command.trade, today);
    default:
      return { ok: false, error: "Não sei fazer isso." };
  }
}
