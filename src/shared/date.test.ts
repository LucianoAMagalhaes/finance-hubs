import { describe, expect, it } from "vitest";
import { isValidDate } from "@/shared";

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
});
