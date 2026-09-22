import { describe, expect, it } from "vitest";
import {
  prepaymentsOf,
  apply,
  emptyState,
  groups,
  trashItems,
  prepaymentPreview,
  projectMonth,
  allExpenses,
  type PrepaymentToSave,
  type Command,
  type Purchase,
  type IsoDate,
  type Axis,
  type State,
  type ExpenseToSave,
  type Month,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

/** Um parcelado de 10× de R$ 389,90 a partir de janeiro: a 7ª parcela cai em julho. */
const EM_DEZ: ExpenseToSave = {
  date: "2026-01-15",
  description: "Notebook",
  jar: "comfort",
  paymentMethod: "credit-card",
  amount: 389_900,
  installments: 10,
};

describe("antecipar parcelas", () => {
  it("3 parcelas antecipadas em julho tiram 8/10 a 10/10 dos seus meses e põem o valor pago em julho", () => {
    const estado = comAntecipacao(EM_DEZ, { date: "2026-07-20", installments: 3, amount: 300_000 });

    expect(valoresPorMes(estado, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990, 300_000],
      [],
      [],
      [],
    ]);
    expect(projectMonth(estado, "2026-06").occurrences.map((o) => o.amount)).toEqual([38_990]);
  });

  it("a ocorrência da antecipação diz que parcelas levou, de quantas e de que total", () => {
    const estado = comAntecipacao(EM_DEZ, { date: "2026-07-20", installments: 3, amount: 300_000 });

    const [, antecipacao] = projectMonth(estado, "2026-07").occurrences;

    expect(antecipacao).toMatchObject({
      description: "Notebook",
      date: "2026-07-20",
      amount: 300_000,
      installment: null,
      prepayment: { id: 1, first: 8, last: 10, of: 10, total: 389_900 },
    });
  });

  it("o valor pago é o que a pessoa informou, com ou sem desconto, e não precisa caber na soma das parcelas", () => {
    const soma = prepaymentPreview(compraDe(salvar(emptyState(), EM_DEZ), 1), { date: "2026-07-20", installments: 3 }, HOJE).cut!.sum;
    expect(soma).toBe(38_990 * 3);

    const caro = comAntecipacao(EM_DEZ, { date: "2026-07-20", installments: 3, amount: 500_000 });

    expect(projectMonth(caro, "2026-07").aggregates.monthExpenses).toBe(38_990 + 500_000);
  });

  it("a antecipação herda pote, tipo de pagamento e tag do parcelado", () => {
    const estado = comAntecipacao({ ...EM_DEZ, jar: "goals", tag: "casa" }, { date: "2026-07-20", installments: 2, amount: 70_000 });

    expect(projectMonth(estado, "2026-07").occurrences.at(-1)).toMatchObject({
      jar: "goals",
      paymentMethod: "credit-card",
      tag: "casa",
    });
  });

  it("a antecipação faz nascer o orçamento do seu mês; os meses de onde as parcelas saíram não nascem", () => {
    const estado = comAntecipacao(EM_DEZ, { date: "2026-07-20", installments: 3, amount: 300_000 });

    expect(projectMonth(estado, "2026-07").budget.born).toBe(true);
    for (const mes of ["2026-08", "2026-09", "2026-10"] as const) {
      expect(projectMonth(estado, mes).budget.born, mes).toBe(false);
    }
  });
});

describe("a prévia da antecipação", () => {
  it("em julho, 3 parcelas de um 10× de janeiro: leva 8/10 a 10/10, de agosto a outubro, e agosto já passou", () => {
    const compra = compraDe(salvar(emptyState(), EM_DEZ), 1);

    expect(prepaymentPreview(compra, { date: "2026-07-20", installments: 3 }, HOJE)).toEqual({
      max: 3,
      refusal: null,
      cut: {
        first: 8,
        last: 10,
        sum: 38_990 * 3,
        firstMonth: "2026-08",
        lastMonth: "2026-10",
        pastMonths: ["2026-08"],
      },
    });
  });

  it.each([
    ["data inválida", EM_DEZ, { date: "2026-02-31", installments: 3 }],
    ["data vazia", EM_DEZ, { date: "", installments: 3 }],
    ["zero parcelas", EM_DEZ, { date: "2026-07-20", installments: 0 }],
    ["parcelas fracionadas", EM_DEZ, { date: "2026-07-20", installments: 1.5 }],
    ["um à vista", { ...EM_DEZ, installments: 1 }, { date: "2025-12-05", installments: 1 }],
    ["um reembolso", { ...EM_DEZ, amount: -389_900 }, { date: "2026-07-20", installments: 3 }],
    ["mais parcelas que o máximo", EM_DEZ, { date: "2026-07-20", installments: 4 }],
    ["nada depois do mês da antecipação", EM_DEZ, { date: "2026-10-05", installments: 1 }],
  ])("%s: a prévia recusa com a mesma frase que aplicar, e não mostra corte", (_, lancamento, prova) => {
    const estado = salvar(emptyState(), lancamento);
    const recusado = apply(estado, antecipar({ ...prova, date: prova.date as IsoDate, amount: 1_000 }), HOJE);
    if (recusado.ok) throw new Error("aplicar deveria recusar");

    const previa = prepaymentPreview(compraDe(estado, 1), prova, HOJE);

    expect(previa.refusal).toBe(recusado.error);
    expect(previa.cut).toBeNull();
  });

  it("uma parcela só: o corte começa e termina no mesmo mês, e nada passou quando hoje ainda é julho", () => {
    const compra = compraDe(salvar(emptyState(), EM_DEZ), 1);

    expect(prepaymentPreview(compra, { date: "2026-07-20", installments: 1 }, "2026-07-25").cut).toMatchObject({
      first: 10,
      last: 10,
      firstMonth: "2026-10",
      lastMonth: "2026-10",
      pastMonths: [],
    });
  });

  it("antecipar em janeiro, já em setembro: sete das parcelas que saem caem em meses que passaram", () => {
    const compra = compraDe(salvar(emptyState(), EM_DEZ), 1);

    expect(prepaymentPreview(compra, { date: "2026-01-20", installments: 9 }, HOJE).cut!.pastMonths).toEqual([
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
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 1, amount: 35_000 }));
    estado = aplicarOk(estado, antecipar({ date: "2026-08-10", installments: 1, amount: 35_000 }));
    const recusado = apply(estado, antecipar({ id: 1, date: "2026-07-20", installments: 3, amount: 90_000 }), HOJE);
    if (recusado.ok) throw new Error("aplicar deveria recusar");

    const previa = prepaymentPreview(compraDe(estado, 1), { id: 1, date: "2026-07-20", installments: 3 }, HOJE);

    expect(previa).toEqual({ max: 1, refusal: recusado.error, cut: null });
  });

  it("com N acima do máximo, o máximo continua dito para a pessoa corrigir", () => {
    const compra = compraDe(salvar(emptyState(), EM_DEZ), 1);

    expect(prepaymentPreview(compra, { date: "2026-07-20", installments: 4 }, HOJE).max).toBe(3);
    expect(prepaymentPreview(compra, { date: "2026-07-20", installments: 0 }, HOJE).max).toBe(3);
    expect(prepaymentPreview(compra, { date: "2026-02-31", installments: 3 }, HOJE).max).toBe(0);
  });
});

describe("quantas parcelas cabem numa antecipação", () => {
  it("só entram parcelas de meses posteriores ao da antecipação: em julho, o máximo de um 10× de janeiro é 3", () => {
    const compra = compraDe(salvar(emptyState(), EM_DEZ), 1);

    expect(maximoEm(compra, "2026-07-20")).toBe(3);
    expect(prepaymentPreview(compra, { date: "2026-07-20", installments: 3 }, HOJE).cut).toMatchObject({ first: 8, last: 10 });
  });

  it("N maior que o máximo é recusado, e o máximo é exatamente o maior N aceito", () => {
    const estado = salvar(emptyState(), EM_DEZ);
    const maximo = maximoEm(compraDe(estado, 1), "2026-07-20");

    expect(apply(estado, antecipar({ date: "2026-07-20", installments: maximo, amount: 1_000 }), HOJE).ok).toBe(true);
    expect(apply(estado, antecipar({ date: "2026-07-20", installments: maximo + 1, amount: 1_000 }), HOJE)).toEqual({
      ok: false,
      error: expect.stringContaining("3"),
    });
    expect(prepaymentPreview(compraDe(estado, 1), { date: "2026-07-20", installments: maximo + 1 }, HOJE).cut).toBeNull();
  });

  it("no mês da última parcela, e depois dele, não sobra nada para antecipar", () => {
    const estado = salvar(emptyState(), EM_DEZ);

    expect(maximoEm(compraDe(estado, 1), "2026-10-05")).toBe(0);
    expect(maximoEm(compraDe(estado, 1), "2026-12-05")).toBe(0);
    expect(apply(estado, antecipar({ date: "2026-10-05", installments: 1, amount: 1_000 }), HOJE).ok).toBe(false);
  });

  it("antes da compra, todas as parcelas são posteriores: o máximo é o parcelado inteiro", () => {
    const estado = salvar(emptyState(), EM_DEZ);

    expect(maximoEm(compraDe(estado, 1), "2025-12-05")).toBe(10);
  });

  it("um à vista não tem parcelas para antecipar, em data nenhuma", () => {
    const estado = salvar(emptyState(), { ...EM_DEZ, installments: 1 });

    expect(maximoEm(compraDe(estado, 1), "2025-12-05")).toBe(0);
    expect(maximoEm(compraDe(estado, 1), "2026-01-20")).toBe(0);
    expect(apply(estado, antecipar({ date: "2025-12-05", installments: 1, amount: 100 }), HOJE)).toEqual({
      ok: false,
      error: expect.stringMatching(/à vista/),
    });
  });

  it("um reembolso parcelado não se antecipa: o valor pago é sempre positivo", () => {
    const estado = salvar(emptyState(), { ...EM_DEZ, amount: -389_900 });

    expect(apply(estado, antecipar({ date: "2026-07-20", installments: 3, amount: 300_000 }), HOJE)).toEqual({
      ok: false,
      error: expect.stringMatching(/reembolso/i),
    });
  });

  it.each([
    ["valor zero", { amount: 0 }],
    ["valor negativo", { amount: -100 }],
    ["valor fracionado", { amount: 10.5 }],
    ["zero parcelas", { installments: 0 }],
    ["parcelas fracionadas", { installments: 1.5 }],
    ["data inválida", { date: "2026-02-31" as IsoDate }],
  ])("%s é recusado", (_, campos) => {
    const estado = salvar(emptyState(), EM_DEZ);

    expect(apply(estado, antecipar({ date: "2026-07-20", installments: 3, amount: 300_000, ...campos }), HOJE).ok).toBe(false);
  });

  it("só um parcelado vivo aceita antecipação", () => {
    let estado = salvar(emptyState(), EM_DEZ);

    expect(apply(estado, antecipar({ expense: 9, date: "2026-07-20", installments: 1, amount: 100 }), HOJE).ok).toBe(false);

    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    expect(apply(estado, antecipar({ date: "2026-07-20", installments: 1, amount: 100 }), HOJE).ok).toBe(false);
  });
});

describe("várias antecipações no mesmo parcelado", () => {
  it("cada uma corta a série pelo fim, em ordem de data, mesmo lançadas fora de ordem", () => {
    let estado = salvar(emptyState(), EM_DEZ);
    // A de agosto entra primeiro, mas a de julho é aplicada antes dela.
    estado = aplicarOk(estado, antecipar({ date: "2026-08-10", installments: 1, amount: 35_000 }));
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 1, amount: 36_000 }));

    const { cuts: cortes, last: ultima } = prepaymentsOf(compraDe(estado, 1));
    expect(cortes.map((c) => [c.prepayment.date, c.first, c.last])).toEqual([
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
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 2, amount: 70_000 }));

    // Sobram as parcelas 1 a 8, e nenhuma delas cai depois de agosto.
    expect(maximoEm(compraDe(estado, 1), "2026-08-10")).toBe(0);
    expect(apply(estado, antecipar({ date: "2026-08-10", installments: 1, amount: 35_000 }), HOJE)).toEqual({
      ok: false,
      error: expect.stringMatching(/agosto de 2026/),
    });
  });

  it("a segunda antecipação só alcança o que a primeira deixou", () => {
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 2, amount: 70_000 }));

    expect(maximoEm(compraDe(estado, 1), "2026-07-25")).toBe(1);
    expect(apply(estado, antecipar({ date: "2026-07-25", installments: 2, amount: 70_000 }), HOJE).ok).toBe(false);
  });

  it("quitar é antecipar todas as que faltam: nenhuma parcela sobra depois", () => {
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-04-10", installments: 3, amount: 100_000 }));
    const compra = compraDe(estado, 1);

    estado = aplicarOk(estado, antecipar({ date: "2026-05-10", installments: maximoEm(compra, "2026-05-10"), amount: 90_000 }));

    expect(prepaymentsOf(compraDe(estado, 1)).last).toBe(5);
    expect(valoresPorMes(estado, ["2026-05", "2026-06", "2026-07", "2026-08"])).toEqual([[90_000, 38_990], [], [], []]);
    expect(maximoEm(compraDe(estado, 1), "2026-05-20")).toBe(0);
  });

  it("corrigir uma antecipação revalida a série inteira: a de julho não pode crescer sobre a de agosto", () => {
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 1, amount: 35_000 }));
    estado = aplicarOk(estado, antecipar({ date: "2026-08-10", installments: 1, amount: 35_000 }));

    expect(maximoEm(compraDe(estado, 1), "2026-07-20", 1)).toBe(1);
    expect(apply(estado, antecipar({ id: 1, date: "2026-07-20", installments: 3, amount: 90_000 }), HOJE).ok).toBe(false);

    const corrigida = aplicarOk(estado, antecipar({ id: 1, date: "2026-07-20", installments: 1, amount: 30_000 }));

    expect(projectMonth(corrigida, "2026-07").occurrences.at(-1)!.amount).toBe(30_000);
  });
});

describe("a trava do parcelado com antecipação", () => {
  const ATIVA: PrepaymentToSave = { expense: 1, date: "2026-07-20", installments: 3, amount: 300_000 };

  it.each([
    ["o total", { amount: 500_000 }],
    ["a data", { date: "2026-02-15" as IsoDate }],
    ["o número de parcelas", { installments: 12 }],
    ["a forma, voltando para à vista", { installments: 1 }],
  ])("editar %s é recusado", (_, campos) => {
    const estado = comAntecipacao(EM_DEZ, ATIVA);

    expect(apply(estado, salvarLancamento({ ...EM_DEZ, ...campos, id: 1 }), HOJE)).toEqual({
      ok: false,
      error: expect.stringMatching(/antecipa/i),
    });
  });

  it("descrição, pote, tipo e tag continuam editáveis, e a ocorrência da antecipação acompanha", () => {
    const estado = comAntecipacao(EM_DEZ, ATIVA);

    const movido = aplicarOk(estado, salvarLancamento({ ...EM_DEZ, id: 1, description: "Notebook novo", jar: "goals", tag: "casa" }));

    expect(projectMonth(movido, "2026-07").occurrences.at(-1)).toMatchObject({
      description: "Notebook novo",
      jar: "goals",
      tag: "casa",
      amount: 300_000,
    });
    expect(groups(projectMonth(movido, "2026-07"), "jar").find((g) => g.key === "goals")!.total).toBe(38_990 + 300_000);
  });

  it("desfeita a antecipação, a trava sai", () => {
    let estado = comAntecipacao(EM_DEZ, ATIVA);
    estado = aplicarOk(estado, { type: "delete", record: "prepayment", id: 1 });

    expect(apply(estado, salvarLancamento({ ...EM_DEZ, id: 1, amount: 500_000 }), HOJE).ok).toBe(true);
  });

  it("um parcelado sem antecipação continua livre", () => {
    const estado = salvar(emptyState(), EM_DEZ);

    expect(apply(estado, salvarLancamento({ ...EM_DEZ, id: 1, amount: 500_000, installments: 5 }), HOJE).ok).toBe(true);
  });
});

describe("desfazer e restaurar uma antecipação", () => {
  it("desfazer manda para a lixeira e devolve as parcelas aos seus meses; restaurar volta ao que era", () => {
    const estado = comAntecipacao(EM_DEZ, { date: "2026-07-20", installments: 3, amount: 300_000 });
    const antes = ["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => projectMonth(estado, m as Month));

    const desfeita = aplicarOk(estado, { type: "delete", record: "prepayment", id: 1 });

    expect(valoresPorMes(desfeita, ["2026-07", "2026-08", "2026-09", "2026-10"])).toEqual([
      [38_990],
      [38_990],
      [38_990],
      [38_990],
    ]);
    expect(trashItems(desfeita).map((i) => [i.record, i.id])).toEqual([["prepayment", 1]]);

    const restaurada = aplicarOk(desfeita, { type: "restore", record: "prepayment", id: 1 });

    expect(["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => projectMonth(restaurada, m as Month))).toEqual(antes);
    expect(trashItems(restaurada)).toEqual([]);
  });

  it("restaurar é recusado quando outra antecipação já levou aquelas parcelas", () => {
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 3, amount: 300_000 }));
    estado = aplicarOk(estado, { type: "delete", record: "prepayment", id: 1 });
    estado = aplicarOk(estado, antecipar({ date: "2026-08-10", installments: 2, amount: 70_000 }));

    const recusa = apply(estado, { type: "restore", record: "prepayment", id: 1 }, HOJE);

    expect(recusa.ok).toBe(false);
    expect(prepaymentsOf(compraDe(estado, 1)).cuts).toHaveLength(1);
  });

  it("restaurar é recusado quando o parcelado encolheu e as parcelas não existem mais", () => {
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 3, amount: 300_000 }));
    estado = aplicarOk(estado, { type: "delete", record: "prepayment", id: 1 });
    estado = aplicarOk(estado, salvarLancamento({ ...EM_DEZ, id: 1, installments: 6 }));

    expect(apply(estado, { type: "restore", record: "prepayment", id: 1 }, HOJE).ok).toBe(false);
  });

  it("não se desfaz duas vezes, nem se restaura o que não está na lixeira", () => {
    let estado = comAntecipacao(EM_DEZ, { date: "2026-07-20", installments: 3, amount: 300_000 });

    expect(apply(estado, { type: "restore", record: "prepayment", id: 1 }, HOJE).ok).toBe(false);
    expect(apply(estado, { type: "delete", record: "prepayment", id: 9 }, HOJE).ok).toBe(false);

    estado = aplicarOk(estado, { type: "delete", record: "prepayment", id: 1 });

    expect(apply(estado, { type: "delete", record: "prepayment", id: 1 }, HOJE).ok).toBe(false);
  });

  it("uma antecipação nova não reaproveita o id de uma que está na lixeira", () => {
    let estado = salvar(emptyState(), EM_DEZ);
    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 1, amount: 35_000 }));
    estado = aplicarOk(estado, { type: "delete", record: "prepayment", id: 1 });

    estado = aplicarOk(estado, antecipar({ date: "2026-07-20", installments: 1, amount: 35_000 }));

    expect(compraDe(estado, 1).prepayments.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("apagar o parcelado com antecipação", () => {
  it("as antecipações vão junto para a lixeira, sem virar item solto, e voltam com ele", () => {
    let estado = comAntecipacao({ ...EM_DEZ, tag: "casa" }, { date: "2026-07-20", installments: 3, amount: 300_000 });
    // Um gasto vivo ao lado, para o mês não ficar zerado quando o parcelado sair.
    estado = salvar(estado, { ...EM_DEZ, date: "2026-07-03", jar: "goals", amount: 12_000, installments: 1, tag: null });
    const antes = projectMonth(estado, "2026-07");

    const apagado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });
    const vista = projectMonth(apagado, "2026-07");

    expect(vista.occurrences.map((o) => o.amount)).toEqual([12_000]);
    expect(vista.aggregates.monthExpenses).toBe(12_000);
    expect(trashItems(apagado).map((i) => [i.record, i.id])).toEqual([["expense", 1]]);
    // Sem o parcelado, os três eixos continuam somando as despesas do mês.
    for (const eixo of ["jar", "payment-method", "tag"] as Axis[]) {
      expect(groups(vista, eixo).reduce((s, g) => s + g.total, 0), eixo).toBe(vista.aggregates.monthExpenses);
    }

    const restaurado = aplicarOk(apagado, { type: "restore", record: "expense", id: 1 });

    expect(projectMonth(restaurado, "2026-07")).toEqual(antes);
  });

  it("uma antecipação de um parcelado na lixeira não se restaura sozinha", () => {
    let estado = comAntecipacao(EM_DEZ, { date: "2026-07-20", installments: 3, amount: 300_000 });
    estado = aplicarOk(estado, { type: "delete", record: "prepayment", id: 1 });
    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    expect(apply(estado, { type: "restore", record: "prepayment", id: 1 }, HOJE)).toEqual({
      ok: false,
      error: expect.stringMatching(/lixeira/i),
    });
  });
});

describe("a invariante dos três eixos com antecipação", () => {
  const EIXOS: Axis[] = ["jar", "payment-method", "tag"];
  const MESES: Month[] = ["2026-01", "2026-04", "2026-07", "2026-08", "2026-10"];

  it("toda ocorrência, inclusive a da antecipação, cai em um grupo de cada eixo", () => {
    let estado = comAntecipacao({ ...EM_DEZ, tag: "casa" }, { date: "2026-07-20", installments: 2, amount: 70_000 });
    // Um segundo parcelado, em outro pote e sem tag, para os eixos terem mais de um grupo.
    estado = salvar(estado, { ...EM_DEZ, date: "2026-07-03", jar: "goals", amount: 60_000, installments: 4, tag: null });
    estado = aplicarOk(estado, antecipar({ expense: 2, date: "2026-08-04", installments: 2, amount: 28_000 }));

    for (const mes of MESES) {
      const vista = projectMonth(estado, mes);
      expect(vista.jars.reduce((s, p) => s + p.total, 0), mes).toBe(vista.aggregates.monthExpenses);
      for (const eixo of EIXOS) {
        const gs = groups(vista, eixo);
        expect(gs.reduce((s, g) => s + g.total, 0), `eixo ${eixo} em ${mes}`).toBe(vista.aggregates.monthExpenses);
        expect(gs.flatMap((g) => g.occurrences), `eixo ${eixo} em ${mes}`).toHaveLength(vista.occurrences.length);
      }
      expect(allExpenses(vista).total, mes).toBe(vista.aggregates.monthExpenses);
    }
  });
});

function valoresPorMes(estado: State, meses: Month[]): number[][] {
  return meses.map((m) => projectMonth(estado, m).occurrences.map((o) => o.amount));
}

const compraDe = (estado: State, id: number): Purchase => estado.expenses.find((l) => l.id === id) as Purchase;

/** O "até N" que a prévia diz para uma antecipação nessa data; com id, para corrigir a que já existe. */
const maximoEm = (compra: Purchase, data: IsoDate, id?: number): number =>
  prepaymentPreview(compra, { ...(id !== undefined && { id }), date: data, installments: 1 }, HOJE).max;

function salvarLancamento(lancamento: ExpenseToSave): Command {
  return { type: "save-expense", expense: lancamento };
}

function antecipar(campos: Partial<PrepaymentToSave> & { date: IsoDate; installments: number; amount: number }): Command {
  return { type: "save-prepayment", prepayment: { expense: 1, ...campos } };
}

function salvar(estado: State, lancamento: ExpenseToSave): State {
  return aplicarOk(estado, salvarLancamento(lancamento));
}

function comAntecipacao(lancamento: ExpenseToSave, antecipacao: Omit<PrepaymentToSave, "expense">): State {
  return aplicarOk(salvar(emptyState(), lancamento), { type: "save-prepayment", prepayment: { expense: 1, ...antecipacao } });
}

function aplicarOk(estado: State, comando: Command, hoje: IsoDate = HOJE): State {
  const resultado = apply(estado, comando, hoje);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}
