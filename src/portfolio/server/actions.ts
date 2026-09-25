"use server";

import type { PortfolioCommand, PortfolioState, Result } from "@/portfolio/domain";
import { executePortfolioOnDatabase, loadPortfolio } from "@/portfolio/persistence";
import { liveSources, refresh as refreshFromSources } from "@/portfolio/sources";
import { appDatabase, localNow, localToday } from "@/server/app";

/**
 * The thin shell between the portfolio's screen and the database. Returns the
 * new state or the refusal. What the sources bring only comes in by `refresh`:
 * there is no price typed by hand.
 */
export async function execute(command: PortfolioCommand): Promise<Result<PortfolioState>> {
  if (command?.type?.startsWith("record-")) return { ok: false, error: "Isso só vem das fontes." };
  return executePortfolioOnDatabase(appDatabase(), command, localToday());
}

/**
 * Asks the real sources for what is old, or for everything when forced, and
 * executes the commands the refresh returns. Returns the state after them; a
 * source that fails only leaves its last value in place.
 */
export async function refresh(force: boolean): Promise<PortfolioState> {
  const database = appDatabase();
  const commands = await refreshFromSources(loadPortfolio(database), liveSources(), localNow(), force === true);
  for (const command of commands) {
    const result = executePortfolioOnDatabase(database, command, localToday());
    if (!result.ok) console.warn(`The refresh couldn't record ${command.type}: ${result.error}`);
  }
  return loadPortfolio(database);
}
