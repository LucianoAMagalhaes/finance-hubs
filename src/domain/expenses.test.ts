import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  type Command,
  type IsoDate,
  type State,
  type ExpenseToSave,
  type NewExpense,
  type Percentages,
  type MonthView,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

/** Setembro nascido com os padrão e R$ 10.000,00 de receita: Conforto tem limite de R$ 1.500,00. */
function comReceita(valor = 1_000_000): State {
  return {
    ...emptyState(),
    budgets: { "2026-09": pcts(30, 25, 15, 15, 10, 5) },
    incomes: [{ id: 1, date: "2026-09-05", description: "Salário", source: "salario", paymentMethod: "transferencia", amount: valor, deletedAt: null }],
  };
}

describe("lançamento à vista", () => {
  it("o gasto entra no total do pote, e só do seu pote", () => {
    const estado = salvar(comReceita(), aVista({ jar: "conforto", amount: 42_000 }));

    const vista = projectMonth(estado, "2026-09");

    expect(poteDe(vista, "conforto").total).toBe(42_000);
    expect(vista.jars.filter((p) => p.id !== "conforto").every((p) => p.total === 0)).toBe(true);
  });

  it("o gasto pesa só no mês da sua data", () => {
    const estado = salvar(comReceita(), aVista({ date: "2026-10-02", jar: "conforto", amount: 42_000 }));

    expect(poteDe(projectMonth(estado, "2026-09"), "conforto").total).toBe(0);
    expect(poteDe(projectMonth(estado, "2026-10"), "conforto").total).toBe(42_000);
  });

  it("o à vista é uma compra de uma parcela: uma ocorrência no mês, com o total", () => {
    const estado = salvar(comReceita(), aVista({ description: "Jantar", jar: "prazeres", paymentMethod: "pix", amount: 18_990 }));

    const vista = projectMonth(estado, "2026-09");

    expect(vista.occurrences).toEqual([
      { expense: 1, date: "2026-09-12", description: "Jantar", jar: "prazeres", paymentMethod: "pix", tag: null, amount: 18_990, installment: null, recurring: null, prepayment: null },
    ]);
    expect(estado.expenses[0]).toMatchObject({ amount: 18_990, installments: 1 });
  });

  it("as ocorrências do mês vêm em ordem de data", () => {
    let estado = salvar(comReceita(), aVista({ date: "2026-09-20", description: "Farmácia" }));
    estado = salvar(estado, aVista({ date: "2026-09-03", description: "Mercado" }));
    estado = salvar(estado, aVista({ date: "2026-10-01", description: "Outubro" }));

    expect(projectMonth(estado, "2026-09").occurrences.map((o) => o.description)).toEqual(["Mercado", "Farmácia"]);
  });

  it("editar o gasto troca o total do pote, e mudá-lo de pote leva o total junto", () => {
    const estado = salvar(comReceita(), aVista({ jar: "conforto", amount: 42_000 }));
    const id = estado.expenses[0]!.id;

    const editado = salvar(estado, { ...aVista({ jar: "metas", amount: 50_000 }), id });

    const vista = projectMonth(editado, "2026-09");
    expect(poteDe(vista, "conforto").total).toBe(0);
    expect(poteDe(vista, "metas").total).toBe(50_000);
    expect(vista.occurrences).toHaveLength(1);
  });

  it("editar um lançamento que não existe é recusado", () => {
    const resultado = apply(comReceita(), salvarLancamento({ ...aVista({}), id: 42 }), HOJE);

    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/não existe/) });
  });
});

describe("veredito", () => {
  // 15% de R$ 3,33 = 49,95 centavos: o limite exato tem fração de centavo.
  it("um centavo acima do limite exato é Estourou, com o estouro exato", () => {
    const estado = salvar(comReceita(333), aVista({ jar: "conforto", amount: 50 }));

    const conforto = poteDe(projectMonth(estado, "2026-09"), "conforto");

    expect(conforto.verdict).toBe("overrun");
    expect(conforto.overrun).toBeCloseTo(0.05, 10);
  });

  it("exatamente no limite é Sobra", () => {
    const estado = salvar(comReceita(), aVista({ jar: "conforto", amount: 150_000 }));

    const conforto = poteDe(projectMonth(estado, "2026-09"), "conforto");

    expect(conforto.verdict).toBe("leftover");
    expect(conforto.overrun).toBe(0);
  });

  it("um centavo acima do limite é Estourou por um centavo", () => {
    const estado = salvar(comReceita(), aVista({ jar: "conforto", amount: 150_001 }));

    const conforto = poteDe(projectMonth(estado, "2026-09"), "conforto");

    expect(conforto.verdict).toBe("overrun");
    expect(conforto.overrun).toBe(1);
  });

  it("mês sem entrada é Sem receita, mesmo com gasto", () => {
    const estado = salvar(emptyState(), aVista({ jar: "conforto", amount: 42_000 }));

    const conforto = poteDe(projectMonth(estado, "2026-09"), "conforto");

    expect(conforto).toMatchObject({ total: 42_000, limit: null, verdict: "no-income", overrun: null });
  });
});

describe("reembolso", () => {
  it("reduz o total do pote e as Despesas, sem mexer na receita nem nos limites", () => {
    const comGasto = salvar(comReceita(), aVista({ jar: "conforto", amount: 80_000 }));
    const antes = projectMonth(comGasto, "2026-09");

    const depois = projectMonth(salvar(comGasto, aVista({ jar: "conforto", amount: -29_790 })), "2026-09");

    expect(poteDe(depois, "conforto").total).toBe(50_210);
    expect(depois.aggregates.monthExpenses).toBe(50_210);
    expect(depois.monthIncome).toBe(antes.monthIncome);
    expect(depois.jars.map((p) => p.limit)).toEqual(antes.jars.map((p) => p.limit));
  });

  it("pode deixar o total do pote negativo", () => {
    const estado = salvar(comReceita(), aVista({ jar: "conforto", amount: -29_790 }));

    const conforto = poteDe(projectMonth(estado, "2026-09"), "conforto");

    expect(conforto.total).toBe(-29_790);
    expect(conforto.verdict).toBe("leftover");
  });

  it("tira um pote do estouro", () => {
    let estado = salvar(comReceita(), aVista({ jar: "conforto", amount: 160_000 }));
    estado = salvar(estado, aVista({ jar: "conforto", amount: -10_000 }));

    expect(poteDe(projectMonth(estado, "2026-09"), "conforto").verdict).toBe("leftover");
  });
});

describe("agregados do mês", () => {
  it("Despesas é a soma dos seis potes, e Saldo do mês é Receitas − Despesas", () => {
    let estado = salvar(comReceita(), aVista({ jar: "custos-fixos", amount: 150_000 }));
    estado = salvar(estado, aVista({ jar: "conforto", amount: 42_000 }));
    estado = salvar(estado, aVista({ jar: "prazeres", amount: 18_990 }));
    estado = salvar(estado, aVista({ jar: "conforto", amount: -5_000 }));
    estado = salvar(estado, aVista({ date: "2026-10-01", jar: "metas", amount: 99_999 }));

    const vista = projectMonth(estado, "2026-09");

    const somaDosPotes = vista.jars.reduce((s, p) => s + p.total, 0);
    expect(vista.aggregates.monthExpenses).toBe(205_990);
    expect(vista.aggregates.monthExpenses).toBe(somaDosPotes);
    expect(vista.aggregates.monthBalance).toBe(1_000_000 - 205_990);
  });

  it("Saldo em conta ignora as ocorrências no Cartão de Crédito", () => {
    let estado = salvar(comReceita(), aVista({ paymentMethod: "cartao-de-credito", amount: 300_000 }));
    estado = salvar(estado, aVista({ paymentMethod: "pix", amount: 50_000 }));
    estado = salvar(estado, aVista({ paymentMethod: "cartao-de-debito", amount: 20_000 }));
    estado = salvar(estado, aVista({ paymentMethod: "cartao-de-credito", amount: -10_000 }));

    const { aggregates: agregados } = projectMonth(estado, "2026-09");

    expect(agregados.monthExpenses).toBe(360_000);
    expect(agregados.accountBalance).toBe(1_000_000 - 70_000);
  });

  it("gastar mais do que entrou deixa o saldo negativo", () => {
    const estado = salvar(comReceita(100_000), aVista({ amount: 150_000 }));

    expect(projectMonth(estado, "2026-09").aggregates.monthBalance).toBe(-50_000);
  });
});

describe("validação do lançamento", () => {
  it.each(["dinheiro", "cartao-de-credito", "cartao-de-debito", "pix", "transferencia", "boleto", "debito-automatico"] as const)(
    "tipo de pagamento %s é aceito",
    (tipo) => {
      expect(apply(emptyState(), salvarLancamento(aVista({ paymentMethod: tipo })), HOJE).ok).toBe(true);
    },
  );

  it.each([
    ["valor zero", { amount: 0 }],
    ["valor com fração de centavo", { amount: 100.5 }],
    ["valor que não é número", { amount: "100" as never }],
    ["descrição em branco", { description: "   " }],
    ["descrição ausente, num comando malformado", { description: undefined as never }],
    ["pote fora da lista", { jar: "viagens" as never }],
    ["tipo de pagamento fora da lista", { paymentMethod: "cheque" as never }],
    ["data que não existe", { date: "2026-02-30" as IsoDate }],
    ["data malformada", { date: "12/09/2026" as IsoDate }],
  ])("%s é recusado", (_, campos) => {
    expect(apply(emptyState(), salvarLancamento(aVista(campos)), HOJE).ok).toBe(false);
  });

  it("a descrição é gravada sem os espaços das pontas", () => {
    const estado = salvar(emptyState(), aVista({ description: "  Mercado  " }));

    expect(estado.expenses[0]).toMatchObject({ description: "Mercado" });
  });
});

describe("nascimento do mês ao salvar um lançamento", () => {
  it("o mês da data do gasto nasce com os percentuais que herdaria", () => {
    const estado: State = { ...emptyState(), budgets: { "2026-08": pcts(40, 20, 10, 10, 10, 10) } };

    const salvo = salvar(estado, aVista({ date: "2026-09-12" }));

    const vista = projectMonth(salvo, "2026-09");
    expect(vista.budget).toEqual({ born: true, inheritedFrom: null });
    expect(vista.jars.map((p) => p.percentage)).toEqual([40, 20, 10, 10, 10, 10]);
  });

  it("um comando recusado não muda o estado nem faz mês nascer", () => {
    const estado = emptyState();

    apply(estado, salvarLancamento(aVista({ amount: 0 })), HOJE);

    expect(estado).toEqual(emptyState());
  });
});

function aVista(campos: Partial<NewExpense>): ExpenseToSave {
  return {
    date: "2026-09-12",
    description: "Mercado",
    jar: "custos-fixos",
    paymentMethod: "cartao-de-debito",
    amount: 10_000,
    installments: 1,
    ...campos,
  };
}

function salvarLancamento(lancamento: ExpenseToSave): Command {
  return { type: "save-expense", expense: lancamento };
}

function salvar(estado: State, lancamento: ExpenseToSave): State {
  const resultado = apply(estado, salvarLancamento(lancamento), HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}

function poteDe(vista: MonthView, id: string) {
  return vista.jars.find((p) => p.id === id)!;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((p, i) => [p.id, valores[i]])) as Percentages;
}
