"use server";

import type { AssetToSave, PortfolioCommand, PortfolioState, Result } from "@/portfolio/domain";
import { executePortfolioOnDatabase, loadPortfolio } from "@/portfolio/persistence";
import { checkAsset, liveSources, refresh as refreshFromSources, type AssetCheck } from "@/portfolio/sources";
import { appDatabase, localNow, localToday } from "@/server/app";

/**
 * The thin shell between the portfolio's screen and the database. Returns the
 * new state or the refusal. What the sources bring only comes in by `refresh`:
 * there is no price typed by hand. An asset only comes in by `saveAsset`,
 * which asks the source first.
 */
export async function execute(command: PortfolioCommand): Promise<Result<PortfolioState>> {
  if (command?.type?.startsWith("record-")) return { ok: false, error: "Isso só vem das fontes." };
  if (command?.type === "save-asset") return { ok: false, error: "O cadastro do ativo passa pela fonte." };
  return executePortfolioOnDatabase(appDatabase(), command, localToday());
}

/**
 * Registers the asset or corrects its ticker, after the real source checks
 * the ticker. Returns the new state, the refusal, or the coins a crypto ticker
 * is shared by, for the person to choose one and save again.
 */
export async function saveAsset(asset: AssetToSave): Promise<Result<PortfolioState> | Extract<AssetCheck, { choose: unknown }>> {
  const database = appDatabase();
  const checked = await checkAsset(loadPortfolio(database), asset, liveSources(), localToday());
  if (!checked.ok) return checked;
  return executePortfolioOnDatabase(database, { type: "save-asset", asset: checked.asset }, localToday());
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
