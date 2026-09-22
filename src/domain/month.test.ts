import { describe, expect, it } from "vitest";
import { proposedDate, monthsBetween, isValidDate, monthOf, monthName, addMonths, lastDayOfMonth } from "@/domain";

describe("utilidades de mês", () => {
  it("soma meses atravessando a virada do ano nos dois sentidos", () => {
    expect(addMonths("2026-09", 1)).toBe("2026-10");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-06", 10)).toBe("2027-04");
    expect(addMonths("2026-06", -18)).toBe("2024-12");
  });

  it("mede a distância em meses de um mês a outro", () => {
    expect(monthsBetween("2026-06", "2026-09")).toBe(3);
    expect(monthsBetween("2026-11", "2027-02")).toBe(3);
    expect(monthsBetween("2026-09", "2026-06")).toBe(-3);
  });

  it("sabe o último dia de cada mês, fevereiro bissexto incluído", () => {
    expect(lastDayOfMonth("2026-09")).toBe(30);
    expect(lastDayOfMonth("2026-12")).toBe(31);
    expect(lastDayOfMonth("2026-02")).toBe(28);
    expect(lastDayOfMonth("2028-02")).toBe(29);
  });

  it("tira o mês de uma data", () => {
    expect(monthOf("2026-09-18")).toBe("2026-09");
  });

  it("reconhece só datas que existem no calendário", () => {
    expect(isValidDate("2026-09-30")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-09-00")).toBe(false);
    expect(isValidDate("30/09/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  it("propõe hoje no mês em curso e o dia 1 em qualquer outro mês", () => {
    expect(proposedDate("2026-09", "2026-09-18")).toBe("2026-09-18");
    expect(proposedDate("2026-06", "2026-09-18")).toBe("2026-06-01");
    expect(proposedDate("2026-12", "2026-09-18")).toBe("2026-12-01");
  });

  it("dá nome ao mês em português", () => {
    expect(monthName("2026-09")).toBe("setembro de 2026");
    expect(monthName("2027-03")).toBe("março de 2027");
  });
});
