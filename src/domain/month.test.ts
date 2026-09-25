import { describe, expect, it } from "vitest";
import { proposedDate, monthsBetween, monthOf, monthName, addMonths, lastDayOfMonth } from "@/domain";

describe("month utilities", () => {
  it("adds months across the year boundary in both directions", () => {
    expect(addMonths("2026-09", 1)).toBe("2026-10");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-06", 10)).toBe("2027-04");
    expect(addMonths("2026-06", -18)).toBe("2024-12");
  });

  it("measures the distance in months from one month to another", () => {
    expect(monthsBetween("2026-06", "2026-09")).toBe(3);
    expect(monthsBetween("2026-11", "2027-02")).toBe(3);
    expect(monthsBetween("2026-09", "2026-06")).toBe(-3);
  });

  it("knows the last day of each month, leap February included", () => {
    expect(lastDayOfMonth("2026-09")).toBe(30);
    expect(lastDayOfMonth("2026-12")).toBe(31);
    expect(lastDayOfMonth("2026-02")).toBe(28);
    expect(lastDayOfMonth("2028-02")).toBe(29);
  });

  it("takes the month out of a date", () => {
    expect(monthOf("2026-09-18")).toBe("2026-09");
  });

  it("proposes today in the current month and day 1 in any other month", () => {
    expect(proposedDate("2026-09", "2026-09-18")).toBe("2026-09-18");
    expect(proposedDate("2026-06", "2026-09-18")).toBe("2026-06-01");
    expect(proposedDate("2026-12", "2026-09-18")).toBe("2026-12-01");
  });

  it("names the month in Portuguese", () => {
    expect(monthName("2026-09")).toBe("setembro de 2026");
    expect(monthName("2027-03")).toBe("março de 2027");
  });
});
