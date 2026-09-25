import { describe, expect, it } from "vitest";
import { decimal, decimalToField, parseDecimal } from "@/portfolio/domain";

describe("exact decimals, scaled to 8 places", () => {
  it("reads what the person types, with a comma or a point, as an exact scaled integer", () => {
    expect(parseDecimal("100")).toBe(100_00000000);
    expect(parseDecimal("0,00321")).toBe(321000);
    expect(parseDecimal("0.00321")).toBe(321000);
    expect(parseDecimal("36,80")).toBe(36_80000000);
    expect(parseDecimal("1.234,5")).toBe(1234_50000000);
    expect(parseDecimal("1.234")).toBe(1234_00000000); // a point in groups of three is the thousands'
    expect(parseDecimal("0.123")).toBe(12300000); // … but never after a leading zero
    expect(parseDecimal("0.001")).toBe(100000);
    expect(parseDecimal("R$ 0,00000001")).toBe(1);
    expect(parseDecimal("0,29")).toBe(29000000); // 0.29 * 1e8 in floating point gives 28999999.999…
    expect(parseDecimal(" 12 ")).toBe(12_00000000);
  });

  it("does not guess a number it cannot read, nor round a ninth place", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
    expect(parseDecimal("-5")).toBeNull();
    expect(parseDecimal("0,000000001")).toBeNull();
  });

  it("writes a scaled integer back as the person would type it", () => {
    expect(decimalToField(321000)).toBe("0,00321");
    expect(decimalToField(100_00000000)).toBe("100");
    expect(decimalToField(36_80000000)).toBe("36,8");
    expect(decimalToField(decimal(1234.5))).toBe("1234,5");
  });
});
