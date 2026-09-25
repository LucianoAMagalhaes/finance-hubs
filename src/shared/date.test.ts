import { describe, expect, it } from "vitest";
import { dateOf, formatDate, formatTime, isValidDate, isValidDateTime, minutesBetween } from "@/shared";

describe("ISO date", () => {
  it("recognizes only dates that exist in the calendar", () => {
    expect(isValidDate("2026-09-30")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-09-00")).toBe(false);
    expect(isValidDate("30/09/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  it("reads as the person writes a date", () => {
    expect(formatDate("2026-03-10")).toBe("10/03/2026");
  });
});

describe("ISO moment", () => {
  it("recognizes only a date that exists with a time of the day", () => {
    expect(isValidDateTime("2026-09-25T14:32:07")).toBe(true);
    expect(isValidDateTime("2026-09-25T24:00:00")).toBe(false);
    expect(isValidDateTime("2026-02-29T10:00:00")).toBe(false);
    expect(isValidDateTime("2026-09-25 14:32:07")).toBe(false);
    expect(isValidDateTime("2026-09-25T14:32:07Z")).toBe(false);
  });

  it("gives its date, its time as the person reads it, and the minutes between two moments", () => {
    expect(dateOf("2026-09-25T14:32:07")).toBe("2026-09-25");
    expect(formatTime("2026-09-25T14:32:07")).toBe("14:32");
    expect(minutesBetween("2026-09-25T14:32:07", "2026-09-25T14:32:37")).toBe(0.5);
    expect(minutesBetween("2026-09-25T14:32:07", "2026-09-25T14:47:07")).toBe(15);
    expect(minutesBetween("2026-09-24T23:50:00", "2026-09-25T00:10:00")).toBe(20);
  });
});
