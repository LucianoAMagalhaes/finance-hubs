import { apply, type Command, type IsoDate, type Result, type State } from "@/domain";
import type { Database } from "./database";
import { load, save } from "./repository";

/**
 * The database's write port: loads the state, applies the command and saves it,
 * in a single transaction. `save` writes every table, so a failure halfway
 * through leaves the database exactly as it was.
 */
export function executeOnDatabase({ db }: Database, command: Command, today: IsoDate): Result<State> {
  return db.transaction((tx) => {
    const result = apply(load(tx), command, today);
    if (result.ok) save(tx, result.value);
    return result;
  });
}
