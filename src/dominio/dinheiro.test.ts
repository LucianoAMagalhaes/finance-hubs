import { describe, expect, it } from "vitest";
import { formatarReais, reaisParaCentavos } from "@/dominio";

// O Intl separa "R$" do número com espaço inquebrável; normalizamos para comparar.
const semNbsp = (s: string) => s.replace(/ /g, " ");

describe("dinheiro em centavos", () => {
  it("formata centavos em reais, com milhar e vírgula", () => {
    expect(semNbsp(formatarReais(0))).toBe("R$ 0,00");
    expect(semNbsp(formatarReais(693580))).toBe("R$ 6.935,80");
    expect(semNbsp(formatarReais(33334))).toBe("R$ 333,34");
  });

  it("valor negativo leva o sinal de menos tipográfico antes do R$", () => {
    expect(semNbsp(formatarReais(-29790))).toBe("− R$ 297,90");
  });

  it("lê reais digitados como centavos exatos", () => {
    expect(reaisParaCentavos("7200")).toBe(720_000);
    expect(reaisParaCentavos("7.200,00")).toBe(720_000);
    expect(reaisParaCentavos("7200,5")).toBe(720_050);
    expect(reaisParaCentavos("0,10")).toBe(10);
    expect(reaisParaCentavos("R$ 1.234,56")).toBe(123_456);
    expect(reaisParaCentavos("1234.56")).toBe(123_456);
    expect(reaisParaCentavos("0,29")).toBe(29); // 0.29 * 100 em ponto flutuante dá 28,999…
    expect(reaisParaCentavos(" 90 ")).toBe(9_000);
  });

  it("não adivinha um valor que não sabe ler", () => {
    expect(reaisParaCentavos("")).toBeNull();
    expect(reaisParaCentavos("abc")).toBeNull();
    expect(reaisParaCentavos("1,234")).toBeNull();
    expect(reaisParaCentavos("12,3,4")).toBeNull();
    expect(reaisParaCentavos("1.2.3")).toBeNull();
  });

  it("limite com fração de centavo só arredonda na exibição", () => {
    expect(semNbsp(formatarReais(33333.5))).toBe("R$ 333,34");
  });
});
