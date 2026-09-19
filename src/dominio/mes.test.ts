import { describe, expect, it } from "vitest";
import { dataProposta, distanciaEntreMeses, ehDataValida, mesDaData, nomeDoMes, somarMeses, ultimoDiaDoMes } from "@/dominio";

describe("utilidades de mês", () => {
  it("soma meses atravessando a virada do ano nos dois sentidos", () => {
    expect(somarMeses("2026-09", 1)).toBe("2026-10");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-06", 10)).toBe("2027-04");
    expect(somarMeses("2026-06", -18)).toBe("2024-12");
  });

  it("mede a distância em meses de um mês a outro", () => {
    expect(distanciaEntreMeses("2026-06", "2026-09")).toBe(3);
    expect(distanciaEntreMeses("2026-11", "2027-02")).toBe(3);
    expect(distanciaEntreMeses("2026-09", "2026-06")).toBe(-3);
  });

  it("sabe o último dia de cada mês, fevereiro bissexto incluído", () => {
    expect(ultimoDiaDoMes("2026-09")).toBe(30);
    expect(ultimoDiaDoMes("2026-12")).toBe(31);
    expect(ultimoDiaDoMes("2026-02")).toBe(28);
    expect(ultimoDiaDoMes("2028-02")).toBe(29);
  });

  it("tira o mês de uma data", () => {
    expect(mesDaData("2026-09-18")).toBe("2026-09");
  });

  it("reconhece só datas que existem no calendário", () => {
    expect(ehDataValida("2026-09-30")).toBe(true);
    expect(ehDataValida("2028-02-29")).toBe(true);
    expect(ehDataValida("2026-02-29")).toBe(false);
    expect(ehDataValida("2026-13-01")).toBe(false);
    expect(ehDataValida("2026-09-00")).toBe(false);
    expect(ehDataValida("30/09/2026")).toBe(false);
    expect(ehDataValida("")).toBe(false);
  });

  it("propõe hoje no mês em curso e o dia 1 em qualquer outro mês", () => {
    expect(dataProposta("2026-09", "2026-09-18")).toBe("2026-09-18");
    expect(dataProposta("2026-06", "2026-09-18")).toBe("2026-06-01");
    expect(dataProposta("2026-12", "2026-09-18")).toBe("2026-12-01");
  });

  it("dá nome ao mês em português", () => {
    expect(nomeDoMes("2026-09")).toBe("setembro de 2026");
    expect(nomeDoMes("2027-03")).toBe("março de 2027");
  });
});
