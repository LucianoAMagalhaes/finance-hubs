import type { IsoDate, IsoDateTime } from "@/shared";
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

const p = (n: number) => String(n).padStart(2, "0");

/** Today's date in the machine's time zone, which is the person's: the app runs locally. */
export function localToday(now: Date = new Date()): IsoDate {
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` as IsoDate;
}

/** Now, on the machine's clock, to the second. */
export function localNow(now: Date = new Date()): IsoDateTime {
  return `${localToday(now)}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}
