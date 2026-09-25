import { ASSET_CLASSES, type AssetClass, type PortfolioState, type Targets } from "@/portfolio/domain";
import type { Connection, Database } from "@/persistence/database";
import { classTarget } from "./schema";

// No business rule here: validating and deriving belong to the domain. This
// module only translates the portfolio's state into rows and back.

export const loadPortfolio = ({ db }: Database): PortfolioState => load(db);

/** The migration creates the five rows, so every class always has its target. */
export function load(db: Connection): PortfolioState {
  const targets = {} as Targets;
  for (const row of db.select().from(classTarget).all()) targets[row.assetClass as AssetClass] = row.target;
  return { targets };
}

/** Saves the state the command returned, inside the caller's transaction. */
export function save(tx: Connection, state: PortfolioState): void {
  for (const { id } of ASSET_CLASSES) {
    const row = { assetClass: id, target: state.targets[id] };
    tx.insert(classTarget).values(row).onConflictDoUpdate({ target: classTarget.assetClass, set: row }).run();
  }
}
