import { describe, expect, it } from "vitest";
import { emptyState, DEFAULT_PERCENTAGES, projectMonth, type Percentages } from "@/domain";
import { conferirRascunho, percentuaisParaPrevia, rascunhoDe, type Rascunho } from "./rascunhoDePercentuais";

/** O rascunho dos percentuais padrão: 30 / 25 / 15 / 15 / 10 / 5. */
const PADRAO = rascunhoDe(projectMonth(emptyState(), "2026-09").jars);

describe("o rascunho dos percentuais", () => {
  it("começa com os percentuais que o mês mostra, escritos como a pessoa os veria no campo", () => {
    expect(PADRAO).toEqual({
      "fixed-costs": "30",
      "financial-freedom": "25",
      comfort: "15",
      goals: "15",
      knowledge: "10",
      pleasures: "5",
    });
  });

  it("um rascunho válido devolve os percentuais lidos, sem erro, e a soma; espaços em volta não atrapalham", () => {
    expect(conferirRascunho({ ...PADRAO, goals: " 5 " })).toEqual({
      percentuais: { ...DEFAULT_PERCENTAGES, goals: 5 },
      erro: null,
      soma: 90,
    });
  });

  it.each([
    ["em branco", ""],
    ["ilegível", "abc"],
  ])("um campo %s é recusado, e conta como zero na soma", (_, texto) => {
    const conferido = conferirRascunho({ ...PADRAO, comfort: texto });

    expect(conferido.erro).toBe("Conforto: o percentual é um inteiro de 0 a 100.");
    expect(conferido.soma).toBe(85);
  });

  it("acima de 100 ou negativo é recusado; na soma e na prévia, entra limitado a 100 ou a 0", () => {
    const passou: Rascunho = { ...PADRAO, "fixed-costs": "150", pleasures: "-5" };

    expect(conferirRascunho(passou)).toMatchObject({ erro: "Custos Fixos: o percentual é um inteiro de 0 a 100.", soma: 165 });
    expect(percentuaisParaPrevia(passou)).toEqual<Percentages>({ ...DEFAULT_PERCENTAGES, "fixed-costs": 100, pleasures: 0 });
    expect(conferirRascunho({ ...PADRAO, pleasures: "-5" })).toMatchObject({ erro: "Prazeres: o percentual é um inteiro de 0 a 100.", soma: 95 });
  });

  it("a prévia conta como zero o que não se lê como número", () => {
    expect(percentuaisParaPrevia({ ...PADRAO, goals: "", knowledge: "x" })).toEqual<Percentages>({
      ...DEFAULT_PERCENTAGES,
      goals: 0,
      knowledge: 0,
    });
  });
});
