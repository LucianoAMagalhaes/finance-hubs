import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  grupos,
  itensNaLixeira,
  lancamentosComATag,
  matizDaTag,
  projetarMes,
  tagsEmUso,
  vigenciasComFim,
  type Comando,
  type Compra,
  type Data,
  type Estado,
  type LancamentoASalvar,
  type Mes,
  type PoteId,
  type Recorrente,
  type VigenciaASalvar,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

/**
 * `#transporte` no combustível de janeiro, num parcelado que atravessa o ano, e
 * num recorrente cuja segunda vigência a mantém; `#casa` à parte, para ver que
 * renomear não a toca.
 */
function historico(): Estado {
  let estado = salvar(estadoVazio(), gasto({ data: "2026-01-10", descricao: "Combustível", tag: "transporte", valor: 30_000 }));
  estado = salvar(estado, gasto({ data: "2026-02-05", descricao: "Pneus", tag: "#Transporte", valor: 120_000, parcelas: 12 }));
  estado = salvar(estado, gasto({ data: "2026-03-01", descricao: "Faxina", tag: "casa", valor: 20_000 }));
  estado = criar(estado, { data: "2026-01-15", descricao: "Estacionamento", pote: "custos-fixos", tipo: "boleto", valor: 25_000, tag: "transporte" });
  return mudar(estado, 4, "2026-06", { descricao: "Estacionamento", pote: "custos-fixos", tipo: "boleto", valor: 28_000, tag: "transporte" });
}

describe("renomear uma tag", () => {
  it("troca o nome nas compras e nas vigências de recorrentes, em meses passados e futuros", () => {
    const estado = renomear(historico(), "transporte", "#Mobilidade");

    expect(tagsEmUso(estado)).toEqual(["casa", "mobilidade"]);
    expect(estado.lancamentos.map((l) => (l.forma === "compra" ? l.tag : l.vigencias.map((v) => v.tag)))).toEqual([
      "mobilidade",
      "mobilidade",
      "casa",
      ["mobilidade", "mobilidade"],
    ]);
    for (const mes of ["2026-01", "2026-02", "2026-06", "2026-12", "2028-01"] as const) {
      expect(projetarMes(estado, mes).ocorrencias.map((o) => o.tag), mes).not.toContain("transporte");
    }
    expect(projetarMes(estado, "2026-01").ocorrencias.map((o) => o.tag)).toEqual(["mobilidade", "mobilidade"]);
  });

  it("o nome novo passa pela mesma normalização da tag", () => {
    const estado = renomear(historico(), "transporte", " # Ida e Volta ");

    expect(tagsEmUso(estado)).toEqual(["casa", "ida-e-volta"]);
  });

  it("nada mais do lançamento muda: só a tag", () => {
    const antes = historico();

    const depois = renomear(antes, "transporte", "mobilidade");

    expect(depois.orcamentos).toEqual(antes.orcamentos);
    expect(depois.entradas).toEqual(antes.entradas);
    expect(depois.lancamentos.map((l) => ({ ...l, tag: null, vigencias: undefined }))).toEqual(
      antes.lancamentos.map((l) => ({ ...l, tag: null, vigencias: undefined })),
    );
  });

  it("renomear não faz mês nenhum nascer: a tag não tem mês", () => {
    const antes = criar(estadoVazio(), { data: "2026-01-15", descricao: "Estacionamento", pote: "custos-fixos", tipo: "pix", valor: 25_000, tag: "transporte" });

    const depois = renomear(antes, "transporte", "mobilidade");

    expect(Object.keys(depois.orcamentos)).toEqual(["2026-01"]);
  });

  it("a cor acompanha o nome novo, porque é derivada dele", () => {
    const estado = renomear(historico(), "transporte", "mobilidade");

    expect(matizDaTag(grupos(projetarMes(estado, "2026-01"), "tag")[0]!.chave!)).toBe(matizDaTag("mobilidade"));
  });

  it("um lançamento na lixeira também é renomeado, para não ressuscitar o nome antigo", () => {
    let estado = salvar(estadoVazio(), gasto({ tag: "transporte" }));
    estado = salvar(estado, gasto({ data: "2026-09-13", tag: "transporte" }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 2 });

    estado = renomear(estado, "transporte", "mobilidade");

    expect(estado.lancamentos.map((l) => (l as Compra).tag)).toEqual(["mobilidade", "mobilidade"]);
    expect(itensNaLixeira(estado)).toHaveLength(1);

    const restaurado = aplicarOk(estado, { tipo: "restaurar", registro: "lancamento", id: 2 });

    expect(tagsEmUso(restaurado)).toEqual(["mobilidade"]);
  });
});

describe("quantos lançamentos usam a tag", () => {
  it("conta os lançamentos vivos, com o recorrente uma vez só, e ignora a lixeira", () => {
    let estado = historico();

    expect(lancamentosComATag(estado, "transporte")).toBe(3);
    expect(lancamentosComATag(estado, "casa")).toBe(1);
    expect(lancamentosComATag(estado, "uber")).toBe(0);

    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    expect(lancamentosComATag(estado, "transporte")).toBe(2);
  });
});

describe("fundir duas tags", () => {
  /** `#transporte` em janeiro e `#uber` em fevereiro, dois gastos cada. */
  function duasTags(): Estado {
    let estado = salvar(estadoVazio(), gasto({ data: "2026-01-10", tag: "transporte", valor: 30_000 }));
    estado = salvar(estado, gasto({ data: "2026-01-20", tag: "transporte", valor: 10_000 }));
    estado = salvar(estado, gasto({ data: "2026-01-25", tag: "uber", valor: 5_000 }));
    return salvar(estado, gasto({ data: "2026-02-03", tag: "uber", valor: 7_000 }));
  }

  it("renomear para um nome que já existe, sem confirmação, é recusado e não muda nada", () => {
    const antes = duasTags();

    const recusa = aplicar(antes, renomearTag("transporte", "uber", false), HOJE);

    expect(recusa).toEqual({ ok: false, erro: expect.stringMatching(/#uber/) });
    expect(aplicar(antes, { tipo: "renomear-tag", de: "transporte", para: "uber" } as Comando, HOJE).ok).toBe(false);
  });

  it("com a confirmação, as duas viram uma só e os totais do grupo somam", () => {
    const estado = aplicarOk(duasTags(), renomearTag("transporte", "uber", true));

    expect(tagsEmUso(estado)).toEqual(["uber"]);
    const janeiro = grupos(projetarMes(estado, "2026-01"), "tag");
    expect(janeiro.map((g) => [g.chave, g.total])).toEqual([["uber", 45_000]]);
    expect(janeiro[0]!.ocorrencias).toHaveLength(3);
    expect(grupos(projetarMes(estado, "2026-02"), "tag").map((g) => [g.chave, g.total])).toEqual([["uber", 7_000]]);
  });

  it("a fusão também junta as vigências de um recorrente", () => {
    let estado = criar(estadoVazio(), { data: "2026-01-15", descricao: "Estacionamento", pote: "custos-fixos", tipo: "boleto", valor: 25_000, tag: "transporte" });
    estado = mudar(estado, 1, "2026-06", { descricao: "Estacionamento", pote: "custos-fixos", tipo: "boleto", valor: 28_000, tag: "uber" });

    estado = aplicarOk(estado, renomearTag("transporte", "uber", true));

    expect(vigenciasComFim(estado.lancamentos[0] as Recorrente).map((v) => v.tag)).toEqual(["uber", "uber"]);
    expect(tagsEmUso(estado)).toEqual(["uber"]);
  });

  it("um nome que só dorme na lixeira também pede confirmação: ele volta ao restaurar", () => {
    let estado = salvar(estadoVazio(), gasto({ tag: "transporte" }));
    estado = salvar(estado, gasto({ data: "2026-09-13", tag: "uber" }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 2 });

    expect(tagsEmUso(estado)).toEqual(["transporte"]);
    expect(aplicar(estado, renomearTag("transporte", "uber", false), HOJE).ok).toBe(false);

    const fundido = aplicarOk(estado, renomearTag("transporte", "uber", true));
    const restaurado = aplicarOk(fundido, { tipo: "restaurar", registro: "lancamento", id: 2 });

    expect(tagsEmUso(restaurado)).toEqual(["uber"]);
  });

  it("confirmar a fusão sem que o nome novo exista renomeia como sempre", () => {
    const estado = aplicarOk(duasTags(), renomearTag("transporte", "mobilidade", true));

    expect(tagsEmUso(estado)).toEqual(["mobilidade", "uber"]);
  });
});

describe("validação do renomear", () => {
  it("renomear uma tag que ninguém usa é recusado", () => {
    const estado = salvar(estadoVazio(), gasto({ tag: "casa" }));

    expect(aplicar(estado, renomearTag("transporte", "mobilidade", false), HOJE).ok).toBe(false);
  });

  it("uma tag que só existe na lixeira já não está em uso: renomeá-la é recusado", () => {
    let estado = salvar(estadoVazio(), gasto({ tag: "transporte" }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    expect(aplicar(estado, renomearTag("transporte", "mobilidade", false), HOJE).ok).toBe(false);
  });

  it("um nome novo que não sobra depois de normalizado é recusado", () => {
    const estado = salvar(estadoVazio(), gasto({ tag: "transporte" }));

    for (const para of ["", "   ", " # "]) {
      expect(aplicar(estado, renomearTag("transporte", para, false), HOJE).ok, para).toBe(false);
    }
  });

  it("renomear para o mesmo nome é recusado, ainda que digitado de outro jeito", () => {
    const estado = salvar(estadoVazio(), gasto({ tag: "transporte" }));

    expect(aplicar(estado, renomearTag("transporte", "#Transporte", false), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/já é o nome/),
    });
  });

  it("o nome de origem também passa pela normalização: vem da tela como foi clicado", () => {
    const estado = salvar(estadoVazio(), gasto({ tag: "transporte" }));

    expect(tagsEmUso(aplicarOk(estado, renomearTag("#Transporte", "mobilidade", false)))).toEqual(["mobilidade"]);
  });

  it.each([
    ["de que não é texto", 42 as never, "mobilidade"],
    ["para que não é texto", "transporte", 42 as never],
  ])("%s é recusado", (_, de, para) => {
    const estado = salvar(estadoVazio(), gasto({ tag: "transporte" }));

    expect(aplicar(estado, renomearTag(de, para, false), HOJE).ok).toBe(false);
  });
});

function gasto(campos: {
  data?: Data;
  descricao?: string;
  pote?: PoteId;
  valor?: number;
  parcelas?: number;
  tag?: string | null;
}): LancamentoASalvar {
  return { data: "2026-09-12", descricao: "Mercado", pote: "custos-fixos", tipo: "cartao-de-credito", valor: 10_000, parcelas: 1, ...campos };
}

const renomearTag = (de: string, para: string, fundir: boolean): Comando => ({ tipo: "renomear-tag", de, para, fundir });

const renomear = (estado: Estado, de: string, para: string) => aplicarOk(estado, renomearTag(de, para, false));

const salvar = (estado: Estado, lancamento: LancamentoASalvar) => aplicarOk(estado, { tipo: "salvar-lancamento", lancamento });

const criar = (estado: Estado, recorrente: VigenciaASalvar & { data: Data }) => aplicarOk(estado, { tipo: "criar-recorrente", recorrente });

const mudar = (estado: Estado, id: number, mes: Mes, vigencia: VigenciaASalvar) =>
  aplicarOk(estado, { tipo: "mudar-recorrente", id, mes, vigencia });

function aplicarOk(estado: Estado, comando: Comando): Estado {
  const resultado = aplicar(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}
