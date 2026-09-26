import type { IsoDate, IsoDateTime, Result } from "@/shared";
import { deleteAsset, saveAsset, type AssetToSave } from "./assets";
import { validateTargets, type Targets } from "./classes";
import type { CurrentExchangeRate } from "./exchangeRate";
import { deletePayout, recordSourcePayouts, savePayout, type PayoutToSave, type SourcePayout } from "./payouts";
import { recordFetch, recordQuotes, type FetchKind, type QuoteToRecord } from "./quotes";
import type { PortfolioState } from "./state";
import { deleteTrade, saveTrade, type TradeToSave } from "./trades";

/**
 * Everything the person can ask of the portfolio, and what the sources bring.
 * Each command arrives with the ticket that uses it.
 */
export type PortfolioCommand =
  | { type: "save-targets"; targets: Targets }
  | { type: "save-asset"; asset: AssetToSave }
  | { type: "delete-asset"; id: number }
  | { type: "save-trade"; trade: TradeToSave }
  | { type: "delete-trade"; id: number }
  | { type: "save-payout"; payout: PayoutToSave }
  | { type: "delete-payout"; id: number }
  // What the sources bring, which `refresh` turns into commands; never typed by the person.
  | { type: "record-quotes"; quotes: QuoteToRecord[]; exchangeRate?: CurrentExchangeRate }
  | { type: "record-source-payouts"; payouts: SourcePayout[] }
  | { type: "record-fetch"; kind: FetchKind; at: IsoDateTime };

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
    case "delete-asset":
      return deleteAsset(state, command.id);
    case "save-trade":
      return saveTrade(state, command.trade, today);
    case "delete-trade":
      return deleteTrade(state, command.id);
    case "save-payout":
      return savePayout(state, command.payout, today);
    case "delete-payout":
      return deletePayout(state, command.id);
    case "record-quotes":
      return recordQuotes(state, command.quotes, command.exchangeRate);
    case "record-source-payouts":
      return recordSourcePayouts(state, command.payouts, today);
    case "record-fetch":
      return recordFetch(state, command.kind, command.at);
    default:
      return { ok: false, error: "Não sei fazer isso." };
  }
}
