"use server";

import type { Command, State, Result } from "@/domain";
import { executeOnDatabase } from "@/persistence";
import { appDatabase, localToday } from "./app";

/** The thin shell between the screen and the database. Returns the new state or the error. */
export async function execute(command: Command): Promise<Result<State>> {
  return executeOnDatabase(appDatabase(), command, localToday());
}
