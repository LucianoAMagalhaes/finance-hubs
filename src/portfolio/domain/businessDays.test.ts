import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IsoDate } from "@/shared";
import { businessDaysAfter, isBusinessDay } from "./businessDays";

describe("the business days", () => {
  it("a national holiday is not one", () => {
    expect(isBusinessDay("2026-11-20")).toBe(false); // Friday, Consciência Negra
    expect(isBusinessDay("2026-11-19")).toBe(true);
    // From Thursday 19/11 to Monday 23/11, over the holiday and the weekend.
    expect(businessDaysAfter("2026-11-19", "2026-11-23")).toBe(1);
  });

  it("the calendar goes up to 2060", () => {
    expect(isBusinessDay("2060-03-01")).toBe(false); // Monday, Carnaval
    expect(isBusinessDay("2060-11-15")).toBe(false); // Monday, Proclamação da República
    expect(isBusinessDay("2060-04-16")).toBe(false); // Friday, Paixão de Cristo
    expect(isBusinessDay("2060-04-15")).toBe(true);
  });

  it("are exactly the days the BCB publishes a CDI", () => {
    const recorded = readFileSync(new URL("../sources/fixtures/bcb-sgs-12-2025-09-26-to-2026-09-25.json", import.meta.url), "utf8");
    const published = (JSON.parse(recorded) as { data: string }[]).map(({ data }) => `${data.slice(6)}-${data.slice(3, 5)}-${data.slice(0, 2)}` as IsoDate);
    const [first, last] = [published[0]!, published.at(-1)!];

    expect(everyDay(first, last).filter(isBusinessDay)).toEqual(published);
    expect(businessDaysAfter(first, last)).toBe(published.length - 1);
  });
});

function everyDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (const d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10) as IsoDate);
  }
  return days;
}
