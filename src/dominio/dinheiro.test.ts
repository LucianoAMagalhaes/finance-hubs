import { describe, expect, it } from "vitest";
import { formatarReais } from "@/dominio";

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

  it("limite com fração de centavo só arredonda na exibição", () => {
    expect(semNbsp(formatarReais(33333.5))).toBe("R$ 333,34");
  });
});
