import { describe, expect, it } from "vitest";
import {
  antecipacoesDe,
  aplicar,
  estadoVazio,
  grupos,
  itensNaLixeira,
  previaDaAntecipacao,
  projetarMes,
  todosOsGastos,
  type AntecipacaoASalvar,
  type Comando,
  type Compra,
  type Data,
  type Eixo,
  type Estado,
  type LancamentoASalvar,
  type Mes,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

/** Um parcelado de 10× de R$ 389,90 a partir de janeiro: a 7ª parcela cai em julho. */
const EM_DEZ: LancamentoASalvar = {
  data: "2026-01-15",
  descricao: "Notebook",
  pote: "conforto",
  tipo: "cartao-de-credito",
  valor: 389_900,
  parcelas: 10,
};

describe("antecipar parcelas", () => {
  it("3 parcelas antecipadas em julho tiram 8/10 a 10/10 dos seus meses e põem o valor pago em julho", () => {
    const estado = comAntecipacao(EM_DEZ, { data: "2026-07-20", parcelas: 3, valor: 300_000 });

    expect(valoresPorMes(estado, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990, 300_000],
      [],
      [],
      [],
    ]);
    expect(projetarMes(estado, "2026-06").ocorrencias.map((o) => o.valor)).toEqual([38_990]);
  });

  it("a ocorrência da antecipação diz que parcelas levou, de quantas e de que total", () => {
    const estado = comAntecipacao(EM_DEZ, { data: "2026-07-20", parcelas: 3, valor: 300_000 });

    const [, antecipacao] = projetarMes(estado, "2026-07").ocorrencias;

    expect(antecipacao).toMatchObject({
      descricao: "Notebook",
      data: "2026-07-20",
      valor: 300_000,
      parcela: null,
      antecipacao: { id: 1, primeira: 8, ultima: 10, de: 10, total: 389_900 },
    });
  });

  it("o valor pago é o que a pessoa informou, com ou sem desconto, e não precisa caber na soma das parcelas", () => {
    const soma = previaDaAntecipacao(compraDe(salvar(estadoVazio(), EM_DEZ), 1), { data: "2026-07-20", parcelas: 3 }, HOJE).corte!.soma;
    expect(soma).toBe(38_990 * 3);

    const caro = comAntecipacao(EM_DEZ, { data: "2026-07-20", parcelas: 3, valor: 500_000 });

    expect(projetarMes(caro, "2026-07").agregados.despesas).toBe(38_990 + 500_000);
  });

  it("a antecipação herda pote, tipo de pagamento e tag do parcelado", () => {
    const estado = comAntecipacao({ ...EM_DEZ, pote: "metas", tag: "casa" }, { data: "2026-07-20", parcelas: 2, valor: 70_000 });

    expect(projetarMes(estado, "2026-07").ocorrencias.at(-1)).toMatchObject({
      pote: "metas",
      tipo: "cartao-de-credito",
      tag: "casa",
    });
  });

  it("a antecipação faz nascer o orçamento do seu mês; os meses de onde as parcelas saíram não nascem", () => {
    const estado = comAntecipacao(EM_DEZ, { data: "2026-07-20", parcelas: 3, valor: 300_000 });

    expect(projetarMes(estado, "2026-07").orcamento.nascido).toBe(true);
    for (const mes of ["2026-08", "2026-09", "2026-10"] as const) {
      expect(projetarMes(estado, mes).orcamento.nascido, mes).toBe(false);
    }
  });
});

describe("a prévia da antecipação", () => {
  it("em julho, 3 parcelas de um 10× de janeiro: leva 8/10 a 10/10, de agosto a outubro, e agosto já passou", () => {
    const compra = compraDe(salvar(estadoVazio(), EM_DEZ), 1);

    expect(previaDaAntecipacao(compra, { data: "2026-07-20", parcelas: 3 }, HOJE)).toEqual({
      maximo: 3,
      recusa: null,
      corte: {
        primeira: 8,
        ultima: 10,
        soma: 38_990 * 3,
        primeiroMes: "2026-08",
        ultimoMes: "2026-10",
        mesesPassados: ["2026-08"],
      },
    });
  });

  it.each([
    ["data inválida", EM_DEZ, { data: "2026-02-31", parcelas: 3 }],
    ["data vazia", EM_DEZ, { data: "", parcelas: 3 }],
    ["zero parcelas", EM_DEZ, { data: "2026-07-20", parcelas: 0 }],
    ["parcelas fracionadas", EM_DEZ, { data: "2026-07-20", parcelas: 1.5 }],
    ["um à vista", { ...EM_DEZ, parcelas: 1 }, { data: "2025-12-05", parcelas: 1 }],
    ["um reembolso", { ...EM_DEZ, valor: -389_900 }, { data: "2026-07-20", parcelas: 3 }],
    ["mais parcelas que o máximo", EM_DEZ, { data: "2026-07-20", parcelas: 4 }],
    ["nada depois do mês da antecipação", EM_DEZ, { data: "2026-10-05", parcelas: 1 }],
  ])("%s: a prévia recusa com a mesma frase que aplicar, e não mostra corte", (_, lancamento, prova) => {
    const estado = salvar(estadoVazio(), lancamento);
    const recusado = aplicar(estado, antecipar({ ...prova, data: prova.data as Data, valor: 1_000 }), HOJE);
    if (recusado.ok) throw new Error("aplicar deveria recusar");

    const previa = previaDaAntecipacao(compraDe(estado, 1), prova, HOJE);

    expect(previa.recusa).toBe(recusado.erro);
    expect(previa.corte).toBeNull();
  });

  it("uma parcela só: o corte começa e termina no mesmo mês, e nada passou quando hoje ainda é julho", () => {
    const compra = compraDe(salvar(estadoVazio(), EM_DEZ), 1);

    expect(previaDaAntecipacao(compra, { data: "2026-07-20", parcelas: 1 }, "2026-07-25").corte).toMatchObject({
      primeira: 10,
      ultima: 10,
      primeiroMes: "2026-10",
      ultimoMes: "2026-10",
      mesesPassados: [],
    });
  });

  it("antecipar em janeiro, já em setembro: sete das parcelas que saem caem em meses que passaram", () => {
    const compra = compraDe(salvar(estadoVazio(), EM_DEZ), 1);

    expect(previaDaAntecipacao(compra, { data: "2026-01-20", parcelas: 9 }, HOJE).corte!.mesesPassados).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("corrigir a de julho para cima da de agosto: a prévia recusa com a mesma frase que aplicar", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 1, valor: 35_000 }));
    estado = aplicarOk(estado, antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }));
    const recusado = aplicar(estado, antecipar({ id: 1, data: "2026-07-20", parcelas: 3, valor: 90_000 }), HOJE);
    if (recusado.ok) throw new Error("aplicar deveria recusar");

    const previa = previaDaAntecipacao(compraDe(estado, 1), { id: 1, data: "2026-07-20", parcelas: 3 }, HOJE);

    expect(previa).toEqual({ maximo: 1, recusa: recusado.erro, corte: null });
  });

  it("com N acima do máximo, o máximo continua dito para a pessoa corrigir", () => {
    const compra = compraDe(salvar(estadoVazio(), EM_DEZ), 1);

    expect(previaDaAntecipacao(compra, { data: "2026-07-20", parcelas: 4 }, HOJE).maximo).toBe(3);
    expect(previaDaAntecipacao(compra, { data: "2026-07-20", parcelas: 0 }, HOJE).maximo).toBe(3);
    expect(previaDaAntecipacao(compra, { data: "2026-02-31", parcelas: 3 }, HOJE).maximo).toBe(0);
  });
});

describe("quantas parcelas cabem numa antecipação", () => {
  it("só entram parcelas de meses posteriores ao da antecipação: em julho, o máximo de um 10× de janeiro é 3", () => {
    const compra = compraDe(salvar(estadoVazio(), EM_DEZ), 1);

    expect(maximoEm(compra, "2026-07-20")).toBe(3);
    expect(previaDaAntecipacao(compra, { data: "2026-07-20", parcelas: 3 }, HOJE).corte).toMatchObject({ primeira: 8, ultima: 10 });
  });

  it("N maior que o máximo é recusado, e o máximo é exatamente o maior N aceito", () => {
    const estado = salvar(estadoVazio(), EM_DEZ);
    const maximo = maximoEm(compraDe(estado, 1), "2026-07-20");

    expect(aplicar(estado, antecipar({ data: "2026-07-20", parcelas: maximo, valor: 1_000 }), HOJE).ok).toBe(true);
    expect(aplicar(estado, antecipar({ data: "2026-07-20", parcelas: maximo + 1, valor: 1_000 }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringContaining("3"),
    });
    expect(previaDaAntecipacao(compraDe(estado, 1), { data: "2026-07-20", parcelas: maximo + 1 }, HOJE).corte).toBeNull();
  });

  it("no mês da última parcela, e depois dele, não sobra nada para antecipar", () => {
    const estado = salvar(estadoVazio(), EM_DEZ);

    expect(maximoEm(compraDe(estado, 1), "2026-10-05")).toBe(0);
    expect(maximoEm(compraDe(estado, 1), "2026-12-05")).toBe(0);
    expect(aplicar(estado, antecipar({ data: "2026-10-05", parcelas: 1, valor: 1_000 }), HOJE).ok).toBe(false);
  });

  it("antes da compra, todas as parcelas são posteriores: o máximo é o parcelado inteiro", () => {
    const estado = salvar(estadoVazio(), EM_DEZ);

    expect(maximoEm(compraDe(estado, 1), "2025-12-05")).toBe(10);
  });

  it("um à vista não tem parcelas para antecipar, em data nenhuma", () => {
    const estado = salvar(estadoVazio(), { ...EM_DEZ, parcelas: 1 });

    expect(maximoEm(compraDe(estado, 1), "2025-12-05")).toBe(0);
    expect(maximoEm(compraDe(estado, 1), "2026-01-20")).toBe(0);
    expect(aplicar(estado, antecipar({ data: "2025-12-05", parcelas: 1, valor: 100 }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/à vista/),
    });
  });

  it("um reembolso parcelado não se antecipa: o valor pago é sempre positivo", () => {
    const estado = salvar(estadoVazio(), { ...EM_DEZ, valor: -389_900 });

    expect(aplicar(estado, antecipar({ data: "2026-07-20", parcelas: 3, valor: 300_000 }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/reembolso/i),
    });
  });

  it.each([
    ["valor zero", { valor: 0 }],
    ["valor negativo", { valor: -100 }],
    ["valor fracionado", { valor: 10.5 }],
    ["zero parcelas", { parcelas: 0 }],
    ["parcelas fracionadas", { parcelas: 1.5 }],
    ["data inválida", { data: "2026-02-31" as Data }],
  ])("%s é recusado", (_, campos) => {
    const estado = salvar(estadoVazio(), EM_DEZ);

    expect(aplicar(estado, antecipar({ data: "2026-07-20", parcelas: 3, valor: 300_000, ...campos }), HOJE).ok).toBe(false);
  });

  it("só um parcelado vivo aceita antecipação", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);

    expect(aplicar(estado, antecipar({ lancamento: 9, data: "2026-07-20", parcelas: 1, valor: 100 }), HOJE).ok).toBe(false);

    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    expect(aplicar(estado, antecipar({ data: "2026-07-20", parcelas: 1, valor: 100 }), HOJE).ok).toBe(false);
  });
});

describe("várias antecipações no mesmo parcelado", () => {
  it("cada uma corta a série pelo fim, em ordem de data, mesmo lançadas fora de ordem", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    // A de agosto entra primeiro, mas a de julho é aplicada antes dela.
    estado = aplicarOk(estado, antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }));
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 1, valor: 36_000 }));

    const { cortes, ultima } = antecipacoesDe(compraDe(estado, 1));
    expect(cortes.map((c) => [c.antecipacao.data, c.primeira, c.ultima])).toEqual([
      ["2026-07-20", 10, 10],
      ["2026-08-10", 9, 9],
    ]);
    expect(ultima).toBe(8);
    // As ocorrências de um mês vêm em ordem de data: a parcela cai no dia 15, e as antecipações nos seus dias.
    expect(valoresPorMes(estado, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990, 36_000],
      [35_000, 38_990],
      [],
      [],
    ]);
  });

  it("a antecipação de julho já não alcança a parcela de agosto: a de agosto não sobra para ninguém", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 2, valor: 70_000 }));

    // Sobram as parcelas 1 a 8, e nenhuma delas cai depois de agosto.
    expect(maximoEm(compraDe(estado, 1), "2026-08-10")).toBe(0);
    expect(aplicar(estado, antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/agosto de 2026/),
    });
  });

  it("a segunda antecipação só alcança o que a primeira deixou", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 2, valor: 70_000 }));

    expect(maximoEm(compraDe(estado, 1), "2026-07-25")).toBe(1);
    expect(aplicar(estado, antecipar({ data: "2026-07-25", parcelas: 2, valor: 70_000 }), HOJE).ok).toBe(false);
  });

  it("quitar é antecipar todas as que faltam: nenhuma parcela sobra depois", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-04-10", parcelas: 3, valor: 100_000 }));
    const compra = compraDe(estado, 1);

    estado = aplicarOk(estado, antecipar({ data: "2026-05-10", parcelas: maximoEm(compra, "2026-05-10"), valor: 90_000 }));

    expect(antecipacoesDe(compraDe(estado, 1)).ultima).toBe(5);
    expect(valoresPorMes(estado, ["2026-05", "2026-06", "2026-07", "2026-08"])).toEqual([[90_000, 38_990], [], [], []]);
    expect(maximoEm(compraDe(estado, 1), "2026-05-20")).toBe(0);
  });

  it("corrigir uma antecipação revalida a série inteira: a de julho não pode crescer sobre a de agosto", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 1, valor: 35_000 }));
    estado = aplicarOk(estado, antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }));

    expect(maximoEm(compraDe(estado, 1), "2026-07-20", 1)).toBe(1);
    expect(aplicar(estado, antecipar({ id: 1, data: "2026-07-20", parcelas: 3, valor: 90_000 }), HOJE).ok).toBe(false);

    const corrigida = aplicarOk(estado, antecipar({ id: 1, data: "2026-07-20", parcelas: 1, valor: 30_000 }));

    expect(projetarMes(corrigida, "2026-07").ocorrencias.at(-1)!.valor).toBe(30_000);
  });
});

describe("a trava do parcelado com antecipação", () => {
  const ATIVA: AntecipacaoASalvar = { lancamento: 1, data: "2026-07-20", parcelas: 3, valor: 300_000 };

  it.each([
    ["o total", { valor: 500_000 }],
    ["a data", { data: "2026-02-15" as Data }],
    ["o número de parcelas", { parcelas: 12 }],
    ["a forma, voltando para à vista", { parcelas: 1 }],
  ])("editar %s é recusado", (_, campos) => {
    const estado = comAntecipacao(EM_DEZ, ATIVA);

    expect(aplicar(estado, salvarLancamento({ ...EM_DEZ, ...campos, id: 1 }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/antecipa/i),
    });
  });

  it("descrição, pote, tipo e tag continuam editáveis, e a ocorrência da antecipação acompanha", () => {
    const estado = comAntecipacao(EM_DEZ, ATIVA);

    const movido = aplicarOk(estado, salvarLancamento({ ...EM_DEZ, id: 1, descricao: "Notebook novo", pote: "metas", tag: "casa" }));

    expect(projetarMes(movido, "2026-07").ocorrencias.at(-1)).toMatchObject({
      descricao: "Notebook novo",
      pote: "metas",
      tag: "casa",
      valor: 300_000,
    });
    expect(grupos(projetarMes(movido, "2026-07"), "pote").find((g) => g.chave === "metas")!.total).toBe(38_990 + 300_000);
  });

  it("desfeita a antecipação, a trava sai", () => {
    let estado = comAntecipacao(EM_DEZ, ATIVA);
    estado = aplicarOk(estado, { tipo: "apagar", registro: "antecipacao", id: 1 });

    expect(aplicar(estado, salvarLancamento({ ...EM_DEZ, id: 1, valor: 500_000 }), HOJE).ok).toBe(true);
  });

  it("um parcelado sem antecipação continua livre", () => {
    const estado = salvar(estadoVazio(), EM_DEZ);

    expect(aplicar(estado, salvarLancamento({ ...EM_DEZ, id: 1, valor: 500_000, parcelas: 5 }), HOJE).ok).toBe(true);
  });
});

describe("desfazer e restaurar uma antecipação", () => {
  it("desfazer manda para a lixeira e devolve as parcelas aos seus meses; restaurar volta ao que era", () => {
    const estado = comAntecipacao(EM_DEZ, { data: "2026-07-20", parcelas: 3, valor: 300_000 });
    const antes = ["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => projetarMes(estado, m as Mes));

    const desfeita = aplicarOk(estado, { tipo: "apagar", registro: "antecipacao", id: 1 });

    expect(valoresPorMes(desfeita, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990],
      [38_990],
      [38_990],
      [38_990],
    ]);
    expect(itensNaLixeira(desfeita).map((i) => [i.registro, i.id])).toEqual([["antecipacao", 1]]);

    const restaurada = aplicarOk(desfeita, { tipo: "restaurar", registro: "antecipacao", id: 1 });

    expect(["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => projetarMes(restaurada, m as Mes))).toEqual(antes);
    expect(itensNaLixeira(restaurada)).toEqual([]);
  });

  it("restaurar é recusado quando outra antecipação já levou aquelas parcelas", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 3, valor: 300_000 }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "antecipacao", id: 1 });
    estado = aplicarOk(estado, antecipar({ data: "2026-08-10", parcelas: 2, valor: 70_000 }));

    const recusa = aplicar(estado, { tipo: "restaurar", registro: "antecipacao", id: 1 }, HOJE);

    expect(recusa.ok).toBe(false);
    expect(antecipacoesDe(compraDe(estado, 1)).cortes).toHaveLength(1);
  });

  it("restaurar é recusado quando o parcelado encolheu e as parcelas não existem mais", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 3, valor: 300_000 }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "antecipacao", id: 1 });
    estado = aplicarOk(estado, salvarLancamento({ ...EM_DEZ, id: 1, parcelas: 6 }));

    expect(aplicar(estado, { tipo: "restaurar", registro: "antecipacao", id: 1 }, HOJE).ok).toBe(false);
  });

  it("não se desfaz duas vezes, nem se restaura o que não está na lixeira", () => {
    let estado = comAntecipacao(EM_DEZ, { data: "2026-07-20", parcelas: 3, valor: 300_000 });

    expect(aplicar(estado, { tipo: "restaurar", registro: "antecipacao", id: 1 }, HOJE).ok).toBe(false);
    expect(aplicar(estado, { tipo: "apagar", registro: "antecipacao", id: 9 }, HOJE).ok).toBe(false);

    estado = aplicarOk(estado, { tipo: "apagar", registro: "antecipacao", id: 1 });

    expect(aplicar(estado, { tipo: "apagar", registro: "antecipacao", id: 1 }, HOJE).ok).toBe(false);
  });

  it("uma antecipação nova não reaproveita o id de uma que está na lixeira", () => {
    let estado = salvar(estadoVazio(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 1, valor: 35_000 }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "antecipacao", id: 1 });

    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 1, valor: 35_000 }));

    expect(compraDe(estado, 1).antecipacoes.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("apagar o parcelado com antecipação", () => {
  it("as antecipações vão junto para a lixeira, sem virar item solto, e voltam com ele", () => {
    let estado = comAntecipacao({ ...EM_DEZ, tag: "casa" }, { data: "2026-07-20", parcelas: 3, valor: 300_000 });
    // Um gasto vivo ao lado, para o mês não ficar zerado quando o parcelado sair.
    estado = salvar(estado, { ...EM_DEZ, data: "2026-07-03", pote: "metas", valor: 12_000, parcelas: 1, tag: null });
    const antes = projetarMes(estado, "2026-07");

    const apagado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });
    const vista = projetarMes(apagado, "2026-07");

    expect(vista.ocorrencias.map((o) => o.valor)).toEqual([12_000]);
    expect(vista.agregados.despesas).toBe(12_000);
    expect(itensNaLixeira(apagado).map((i) => [i.registro, i.id])).toEqual([["lancamento", 1]]);
    // Sem o parcelado, os três eixos continuam somando as despesas do mês.
    for (const eixo of ["pote", "tipo", "tag"] as Eixo[]) {
      expect(grupos(vista, eixo).reduce((s, g) => s + g.total, 0), eixo).toBe(vista.agregados.despesas);
    }

    const restaurado = aplicarOk(apagado, { tipo: "restaurar", registro: "lancamento", id: 1 });

    expect(projetarMes(restaurado, "2026-07")).toEqual(antes);
  });

  it("uma antecipação de um parcelado na lixeira não se restaura sozinha", () => {
    let estado = comAntecipacao(EM_DEZ, { data: "2026-07-20", parcelas: 3, valor: 300_000 });
    estado = aplicarOk(estado, { tipo: "apagar", registro: "antecipacao", id: 1 });
    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    expect(aplicar(estado, { tipo: "restaurar", registro: "antecipacao", id: 1 }, HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/lixeira/i),
    });
  });
});

describe("a invariante dos três eixos com antecipação", () => {
  const EIXOS: Eixo[] = ["pote", "tipo", "tag"];
  const MESES: Mes[] = ["2026-01", "2026-04", "2026-07", "2026-08", "2026-10"];

  it("toda ocorrência, inclusive a da antecipação, cai em um grupo de cada eixo", () => {
    let estado = comAntecipacao({ ...EM_DEZ, tag: "casa" }, { data: "2026-07-20", parcelas: 2, valor: 70_000 });
    // Um segundo parcelado, em outro pote e sem tag, para os eixos terem mais de um grupo.
    estado = salvar(estado, { ...EM_DEZ, data: "2026-07-03", pote: "metas", valor: 60_000, parcelas: 4, tag: null });
    estado = aplicarOk(estado, antecipar({ lancamento: 2, data: "2026-08-04", parcelas: 2, valor: 28_000 }));

    for (const mes of MESES) {
      const vista = projetarMes(estado, mes);
      expect(vista.potes.reduce((s, p) => s + p.total, 0), mes).toBe(vista.agregados.despesas);
      for (const eixo of EIXOS) {
        const gs = grupos(vista, eixo);
        expect(gs.reduce((s, g) => s + g.total, 0), `eixo ${eixo} em ${mes}`).toBe(vista.agregados.despesas);
        expect(gs.flatMap((g) => g.ocorrencias), `eixo ${eixo} em ${mes}`).toHaveLength(vista.ocorrencias.length);
      }
      expect(todosOsGastos(vista).total, mes).toBe(vista.agregados.despesas);
    }
  });
});

function valoresPorMes(estado: Estado, meses: Mes[]): number[][] {
  return meses.map((m) => projetarMes(estado, m).ocorrencias.map((o) => o.valor));
}

const compraDe = (estado: Estado, id: number): Compra => estado.lancamentos.find((l) => l.id === id) as Compra;

/** O "até N" que a prévia diz para uma antecipação nessa data; com id, para corrigir a que já existe. */
const maximoEm = (compra: Compra, data: Data, id?: number): number =>
  previaDaAntecipacao(compra, { ...(id !== undefined && { id }), data, parcelas: 1 }, HOJE).maximo;

function salvarLancamento(lancamento: LancamentoASalvar): Comando {
  return { tipo: "salvar-lancamento", lancamento };
}

function antecipar(campos: Partial<AntecipacaoASalvar> & { data: Data; parcelas: number; valor: number }): Comando {
  return { tipo: "salvar-antecipacao", antecipacao: { lancamento: 1, ...campos } };
}

function salvar(estado: Estado, lancamento: LancamentoASalvar): Estado {
  return aplicarOk(estado, salvarLancamento(lancamento));
}

function comAntecipacao(lancamento: LancamentoASalvar, antecipacao: Omit<AntecipacaoASalvar, "lancamento">): Estado {
  return aplicarOk(salvar(estadoVazio(), lancamento), { tipo: "salvar-antecipacao", antecipacao: { lancamento: 1, ...antecipacao } });
}

function aplicarOk(estado: Estado, comando: Comando, hoje: Data = HOJE): Estado {
  const resultado = aplicar(estado, comando, hoje);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}
