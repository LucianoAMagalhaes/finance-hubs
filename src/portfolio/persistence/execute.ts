import { apply, type IsoDate, type PortfolioCommand, type PortfolioState, type Result } from "@/portfolio/domain";
import type { Database } from "@/persistence/database";
import { load, save } from "./repository";

/**
 * The portfolio's write port: loads its state, applies the command and saves
 * it, in a single transaction. The budget's tables are never read or written.
 */
export function executePortfolioOnDatabase(
  { db }: Database,
  command: PortfolioCommand,
  today: IsoDate,
): Result<PortfolioState> {
  return db.transaction((tx) => {
    const result = apply(load(tx), command, today);
    if (result.ok) save(tx, result.value);
    return result;
  });
}
