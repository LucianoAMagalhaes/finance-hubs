import type { IsoDate } from "@/domain";
import type { Database } from "@/persistence";
import { configFromEnv, startUp } from "./startup";

// One process, one database. Kept on globalThis because Next loads this module
// in more than one bundle (instrumentation, pages, actions) and, in dev, on
// every reload: startup, and so the backup, happens only once.
const processGlobal = globalThis as typeof globalThis & { __financeHubsDatabase?: Database };

export function appDatabase(): Database {
  processGlobal.__financeHubsDatabase ??= startUp(configFromEnv());
  return processGlobal.__financeHubsDatabase;
}

/** Today's date in the machine's time zone, which is the person's: the app runs locally. */
export function localToday(now: Date = new Date()): IsoDate {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` as IsoDate;
}
