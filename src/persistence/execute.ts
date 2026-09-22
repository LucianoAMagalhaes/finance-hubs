import { apply, type Command, type IsoDate, type State } from "@/domain";
import type { Database } from "./database";
import { load, save } from "./repository";

/** The refusal says which command of the sequence the domain refused, with its text intact. */
export type DatabaseResult = { ok: true; value: State } | { ok: false; error: string; index: number };

/**
 * The database's write port: loads the state, applies the commands in order and
 * saves, in a single transaction. If the domain refuses a command, nothing is
 * saved — not even the ones that came before it.
 */
export function executeOnDatabase({ db }: Database, commands: Command[], today: IsoDate): DatabaseResult {
  return db.transaction((tx) => {
    let state = load(tx);
    for (const [index, command] of commands.entries()) {
      const result = apply(state, command, today);
      if (!result.ok) return { ...result, index };
      state = result.value;
    }
    save(tx, state);
    return { ok: true, value: state };
  });
}
