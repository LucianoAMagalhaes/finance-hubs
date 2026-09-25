import { describe, expect, it } from "vitest";
import { formatReais, reaisToCents } from "@/shared";

// Intl separates "R$" from the number with a non-breaking space; we normalize it to compare.
const withoutNbsp = (s: string) => s.replace(/ /g, " ");

describe("money in cents", () => {
  it("formats cents as reais, with thousands separator and decimal comma", () => {
    expect(withoutNbsp(formatReais(0))).toBe("R$ 0,00");
    expect(withoutNbsp(formatReais(693580))).toBe("R$ 6.935,80");
    expect(withoutNbsp(formatReais(33334))).toBe("R$ 333,34");
  });

  it("a negative amount takes the typographic minus sign before the R$", () => {
    expect(withoutNbsp(formatReais(-29790))).toBe("− R$ 297,90");
  });

  it("reads typed reais as exact cents", () => {
    expect(reaisToCents("7200")).toBe(720_000);
    expect(reaisToCents("7.200,00")).toBe(720_000);
    expect(reaisToCents("7200,5")).toBe(720_050);
    expect(reaisToCents("0,10")).toBe(10);
    expect(reaisToCents("R$ 1.234,56")).toBe(123_456);
    expect(reaisToCents("1234.56")).toBe(123_456);
    expect(reaisToCents("0,29")).toBe(29); // 0.29 * 100 in floating point gives 28.999…
    expect(reaisToCents(" 90 ")).toBe(9_000);
  });

  it("does not guess an amount it cannot read", () => {
    expect(reaisToCents("")).toBeNull();
    expect(reaisToCents("abc")).toBeNull();
    expect(reaisToCents("1,234")).toBeNull();
    expect(reaisToCents("12,3,4")).toBeNull();
    expect(reaisToCents("1.2.3")).toBeNull();
  });

  it("a limit with a fraction of a cent is only rounded on display", () => {
    expect(withoutNbsp(formatReais(33333.5))).toBe("R$ 333,34");
  });
});
