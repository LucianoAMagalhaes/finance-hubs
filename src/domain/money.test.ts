import { describe, expect, it } from "vitest";
import { formatReais, reaisToCents } from "@/domain";

// O Intl separa "R$" do número com espaço inquebrável; normalizamos para comparar.
const semNbsp = (s: string) => s.replace(/ /g, " ");

describe("dinheiro em centavos", () => {
  it("formata centavos em reais, com milhar e vírgula", () => {
    expect(semNbsp(formatReais(0))).toBe("R$ 0,00");
    expect(semNbsp(formatReais(693580))).toBe("R$ 6.935,80");
    expect(semNbsp(formatReais(33334))).toBe("R$ 333,34");
  });

  it("valor negativo leva o sinal de menos tipográfico antes do R$", () => {
    expect(semNbsp(formatReais(-29790))).toBe("− R$ 297,90");
  });

  it("lê reais digitados como centavos exatos", () => {
    expect(reaisToCents("7200")).toBe(720_000);
    expect(reaisToCents("7.200,00")).toBe(720_000);
    expect(reaisToCents("7200,5")).toBe(720_050);
    expect(reaisToCents("0,10")).toBe(10);
    expect(reaisToCents("R$ 1.234,56")).toBe(123_456);
    expect(reaisToCents("1234.56")).toBe(123_456);
    expect(reaisToCents("0,29")).toBe(29); // 0.29 * 100 em ponto flutuante dá 28,999…
    expect(reaisToCents(" 90 ")).toBe(9_000);
  });

  it("não adivinha um valor que não sabe ler", () => {
    expect(reaisToCents("")).toBeNull();
    expect(reaisToCents("abc")).toBeNull();
    expect(reaisToCents("1,234")).toBeNull();
    expect(reaisToCents("12,3,4")).toBeNull();
    expect(reaisToCents("1.2.3")).toBeNull();
  });

  it("limite com fração de centavo só arredonda na exibição", () => {
    expect(semNbsp(formatReais(33333.5))).toBe("R$ 333,34");
  });
});
