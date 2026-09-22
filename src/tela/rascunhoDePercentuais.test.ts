import { describe, expect, it } from "vitest";
import { emptyState, DEFAULT_PERCENTAGES, projectMonth, type Percentages } from "@/domain";
import { conferirRascunho, percentuaisParaPrevia, rascunhoDe, type Rascunho } from "./rascunhoDePercentuais";

/** O rascunho dos percentuais padrão: 30 / 25 / 15 / 15 / 10 / 5. */
const PADRAO = rascunhoDe(projectMonth(emptyState(), "2026-09").jars);

describe("o rascunho dos percentuais", () => {
  it("começa com os percentuais que o mês mostra, escritos como a pessoa os veria no campo", () => {
    expect(PADRAO).toEqual({
      "custos-fixos": "30",
      "liberdade-financeira": "25",
      conforto: "15",
      metas: "15",
      conhecimento: "10",
      prazeres: "5",
    });
  });

  it("um rascunho válido devolve os percentuais lidos, sem erro, e a soma; espaços em volta não atrapalham", () => {
    expect(conferirRascunho({ ...PADRAO, metas: " 5 " })).toEqual({
      percentuais: { ...DEFAULT_PERCENTAGES, metas: 5 },
      erro: null,
      soma: 90,
    });
  });

  it.each([
    ["em branco", ""],
    ["ilegível", "abc"],
  ])("um campo %s é recusado, e conta como zero na soma", (_, texto) => {
    const conferido = conferirRascunho({ ...PADRAO, conforto: texto });

    expect(conferido.erro).toBe("Conforto: o percentual é um inteiro de 0 a 100.");
    expect(conferido.soma).toBe(85);
  });

  it("acima de 100 ou negativo é recusado; na soma e na prévia, entra limitado a 100 ou a 0", () => {
    const passou: Rascunho = { ...PADRAO, "custos-fixos": "150", prazeres: "-5" };

    expect(conferirRascunho(passou)).toMatchObject({ erro: "Custos Fixos: o percentual é um inteiro de 0 a 100.", soma: 165 });
    expect(percentuaisParaPrevia(passou)).toEqual<Percentages>({ ...DEFAULT_PERCENTAGES, "custos-fixos": 100, prazeres: 0 });
    expect(conferirRascunho({ ...PADRAO, prazeres: "-5" })).toMatchObject({ erro: "Prazeres: o percentual é um inteiro de 0 a 100.", soma: 95 });
  });

  it("a prévia conta como zero o que não se lê como número", () => {
    expect(percentuaisParaPrevia({ ...PADRAO, metas: "", conhecimento: "x" })).toEqual<Percentages>({
      ...DEFAULT_PERCENTAGES,
      metas: 0,
      conhecimento: 0,
    });
  });
});
