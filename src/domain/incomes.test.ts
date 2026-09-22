import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  type Command,
  type IsoDate,
  type IncomeToSave,
  type State,
  type NewIncome,
  type Percentages,
  type MonthView,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

describe("entradas e receita do mês", () => {
  it("uma entrada faz a receita do mês existir, e com ela os seis limites", () => {
    const estado = salvar(emptyState(), entrada({ date: "2026-09-05", amount: 1_000_000 }));

    const vista = projectMonth(estado, "2026-09");

    expect(vista.monthIncome).toBe(1_000_000);
    expect(vista.aggregates.monthIncome).toBe(1_000_000);
    expect(vista.jars.map((p) => p.limit)).toEqual([300_000, 250_000, 150_000, 150_000, 100_000, 50_000]);
    expect(vista.jars.map((p) => p.verdict)).toEqual(Array(6).fill("leftover"));
  });

  it("a receita é a soma das entradas do mês, e só delas", () => {
    let estado = salvar(emptyState(), entrada({ date: "2026-09-05", amount: 720_000 }));
    estado = salvar(estado, entrada({ date: "2026-09-20", amount: 90_000, source: "freelance", paymentMethod: "pix" }));
    estado = salvar(estado, entrada({ date: "2026-10-05", amount: 500_000 }));

    expect(projectMonth(estado, "2026-09").monthIncome).toBe(810_000);
    expect(projectMonth(estado, "2026-10").monthIncome).toBe(500_000);
    expect(projectMonth(estado, "2026-08").monthIncome).toBe(0);
  });

  it("o limite é exato: a fração de centavo não é arredondada", () => {
    const estado = salvar(emptyState(), entrada({ date: "2026-09-05", amount: 333 }));

    // 5% de R$ 3,33 = 16,65 centavos
    expect(poteDe(projectMonth(estado, "2026-09"), "pleasures").limit).toBeCloseTo(16.65, 10);
  });

  it("o não alocado aparece em reais quando há receita", () => {
    let estado: State = { ...emptyState(), budgets: { "2026-09": pcts(30, 20, 15, 15, 5, 5) } };
    estado = salvar(estado, entrada({ date: "2026-09-05", amount: 500_000 }));

    expect(projectMonth(estado, "2026-09").unallocated).toEqual({ percentage: 10, amount: 50_000 });
    expect(projectMonth(emptyState(), "2026-09").unallocated).toEqual({ percentage: 0, amount: null });
  });

  it("a vista traz as entradas do mês em ordem de data", () => {
    let estado = salvar(emptyState(), entrada({ date: "2026-09-20", description: "Freela", source: "freelance" }));
    estado = salvar(estado, entrada({ date: "2026-09-05", description: "Salário" }));
    estado = salvar(estado, entrada({ date: "2026-10-05", description: "Salário outubro" }));

    expect(projectMonth(estado, "2026-09").incomes.map((e) => [e.date, e.description, e.source])).toEqual([
      ["2026-09-05", "Salário", "salary"],
      ["2026-09-20", "Freela", "freelance"],
    ]);
  });

  it("editar uma entrada troca o valor e move a receita junto", () => {
    const estado = salvar(emptyState(), entrada({ date: "2026-09-05", amount: 720_000 }));
    const id = projectMonth(estado, "2026-09").incomes[0]!.id;

    const editado = salvar(estado, { ...entrada({ date: "2026-09-05", amount: 750_000 }), id });

    expect(projectMonth(editado, "2026-09").monthIncome).toBe(750_000);
    expect(projectMonth(editado, "2026-09").incomes).toHaveLength(1);
  });

  it("mudar a data para outro mês leva a receita junto e faz o mês de destino nascer", () => {
    const estado = salvar(emptyState(), entrada({ date: "2026-10-05", amount: 720_000 }));
    const id = projectMonth(estado, "2026-10").incomes[0]!.id;

    const movido = salvar(estado, { ...entrada({ date: "2026-09-30", amount: 720_000 }), id });

    const outubro = projectMonth(movido, "2026-10");
    const setembro = projectMonth(movido, "2026-09");
    expect(outubro.monthIncome).toBe(0);
    expect(outubro.jars.every((p) => p.limit === null && p.verdict === "no-income")).toBe(true);
    expect(outubro.budget.born).toBe(true);
    expect(setembro.monthIncome).toBe(720_000);
    expect(setembro.budget.born).toBe(true);
  });

  it("editar uma entrada que não existe é recusado", () => {
    const resultado = apply(emptyState(), salvarEntrada({ ...entrada({}), id: 42 }), HOJE);

    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/não existe/) });
  });
});

describe("validação da entrada", () => {
  it.each(["credit-card", "debit-card", "boleto", "direct-debit"] as const)(
    "tipo de pagamento %s é recusado: entrada só em Dinheiro, PIX ou Transferência",
    (tipo) => {
      // O tipo não deixa, mas o comando chega do navegador: o domínio confere de novo.
      const resultado = apply(emptyState(), salvarEntrada(entrada({ paymentMethod: tipo as never })), HOJE);

      expect(resultado.ok).toBe(false);
    },
  );

  it.each(["cash", "pix", "transfer"] as const)("tipo de pagamento %s é aceito", (tipo) => {
    expect(apply(emptyState(), salvarEntrada(entrada({ paymentMethod: tipo })), HOJE).ok).toBe(true);
  });

  it.each([
    ["valor zero", { amount: 0 }],
    ["valor negativo", { amount: -10_000 }],
    ["valor com fração de centavo", { amount: 100.5 }],
    ["descrição em branco", { description: "   " }],
    ["descrição ausente, num comando malformado", { description: undefined as never }],
    ["fonte fora da lista", { source: "herança" as never }],
    ["data que não existe", { date: "2026-02-30" as IsoDate }],
    ["data malformada", { date: "30/09/2026" as IsoDate }],
  ])("%s é recusado", (_, campos) => {
    const resultado = apply(emptyState(), salvarEntrada(entrada(campos)), HOJE);

    expect(resultado.ok).toBe(false);
  });

  it("um comando recusado não muda o estado nem faz mês nascer", () => {
    const estado = emptyState();

    apply(estado, salvarEntrada(entrada({ amount: 0 })), HOJE);

    expect(projectMonth(estado, "2026-09").budget.born).toBe(false);
  });

  it("a descrição é gravada sem os espaços das pontas", () => {
    const estado = salvar(emptyState(), entrada({ date: "2026-09-05", description: "  Salário  " }));

    expect(projectMonth(estado, "2026-09").incomes[0]!.description).toBe("Salário");
  });
});

describe("nascimento do mês ao salvar uma entrada", () => {
  it("o mês da entrada nasce com os percentuais que herdaria", () => {
    const estado: State = { ...emptyState(), budgets: { "2026-08": pcts(40, 20, 10, 10, 10, 10) } };

    const salvo = salvar(estado, entrada({ date: "2026-09-05" }));

    const vista = projectMonth(salvo, "2026-09");
    expect(vista.budget).toEqual({ born: true, inheritedFrom: null });
    expect(vista.jars.map((p) => p.percentage)).toEqual([40, 20, 10, 10, 10, 10]);
  });

  it("salário de março lançado com setembro já nascido faz março nascer com os padrão", () => {
    let estado = salvar(emptyState(), entrada({ date: "2026-09-05" }));
    estado = { ...estado, budgets: { ...estado.budgets, "2026-09": pcts(50, 10, 10, 10, 10, 10) } };

    const salvo = salvar(estado, entrada({ date: "2026-03-05" }));

    const marco = projectMonth(salvo, "2026-03");
    expect(marco.budget.born).toBe(true);
    expect(marco.jars.map((p) => p.percentage)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("caso intercalado: dezembro herda de outubro mesmo com janeiro já nascido de setembro", () => {
    let estado: State = { ...emptyState(), budgets: { "2026-09": pcts(50, 10, 10, 10, 10, 10) } };
    estado = salvar(estado, entrada({ date: "2027-01-05" }));
    estado = { ...estado, budgets: { ...estado.budgets, "2026-10": pcts(20, 20, 20, 20, 10, 10) } };

    const salvo = salvar(estado, entrada({ date: "2026-12-05" }));

    expect(projectMonth(salvo, "2027-01").jars.map((p) => p.percentage)).toEqual([50, 10, 10, 10, 10, 10]);
    expect(projectMonth(salvo, "2026-12").jars.map((p) => p.percentage)).toEqual([20, 20, 20, 20, 10, 10]);
  });

  it("um mês que já nasceu não tem os percentuais trocados por uma entrada nova", () => {
    let estado: State = {
      ...emptyState(),
      budgets: { "2026-08": pcts(40, 20, 10, 10, 10, 10), "2026-09": pcts(30, 30, 10, 10, 10, 10) },
    };

    estado = salvar(estado, entrada({ date: "2026-09-05" }));

    expect(projectMonth(estado, "2026-09").jars.map((p) => p.percentage)).toEqual([30, 30, 10, 10, 10, 10]);
  });

  it("aplicar não muda o estado recebido", () => {
    const estado = emptyState();

    salvar(estado, entrada({ date: "2026-09-05" }));

    expect(estado).toEqual(emptyState());
  });
});

function entrada(campos: Partial<NewIncome>): NewIncome {
  return {
    date: "2026-09-05",
    description: "Salário",
    source: "salary",
    paymentMethod: "transfer",
    amount: 720_000,
    ...campos,
  };
}

function salvarEntrada(entrada: IncomeToSave): Command {
  return { type: "save-income", income: entrada };
}

function salvar(estado: State, entrada: IncomeToSave): State {
  const resultado = apply(estado, salvarEntrada(entrada), HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}

function poteDe(vista: MonthView, id: string) {
  return vista.jars.find((p) => p.id === id)!;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((p, i) => [p.id, valores[i]])) as Percentages;
}
