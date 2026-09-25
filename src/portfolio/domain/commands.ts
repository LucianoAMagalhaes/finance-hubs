import type { IsoDate, Result } from "@/shared";
import { validateTargets, type Targets } from "./classes";
import type { PortfolioState } from "./state";

/**
 * Everything the person can ask of the portfolio. Each command arrives with the ticket that uses it.
 */
export type PortfolioCommand = { type: "save-targets"; targets: Targets };

/**
 * Applies a command and returns the new state or the refusal, in Portuguese.
 * Pure: never changes the state it receives, and `today` comes from outside so
 * the domain doesn't read the clock.
 */
export function apply(state: PortfolioState, command: PortfolioCommand, today: IsoDate): Result<PortfolioState> {
  void today; // No command reads it yet; the ones with a date will.
  switch (command?.type) {
    case "save-targets": {
      const error = validateTargets(command.targets);
      if (error) return { ok: false, error };
      return { ok: true, value: { ...state, targets: { ...command.targets } } };
    }
    default:
      return { ok: false, error: "Não sei fazer isso." };
  }
}
