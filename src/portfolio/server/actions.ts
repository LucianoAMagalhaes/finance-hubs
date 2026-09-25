"use server";

import type { PortfolioCommand, PortfolioState, Result } from "@/portfolio/domain";
import { executePortfolioOnDatabase } from "@/portfolio/persistence";
import { appDatabase, localToday } from "@/server/app";

/** The thin shell between the portfolio's screen and the database. Returns the new state or the refusal. */
export async function execute(command: PortfolioCommand): Promise<Result<PortfolioState>> {
  return executePortfolioOnDatabase(appDatabase(), command, localToday());
}
