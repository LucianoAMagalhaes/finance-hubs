import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  type Command,
  type IsoDate,
  type State,
  type Month,
  type Percentages,
  type MonthView,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

describe("editar os percentuais do mês", () => {
  it("salvar percentuais num mês não nascido o faz nascer com os valores salvos", () => {
    const salvo = salvar(emptyState(), "2026-10", pcts(40, 20, 15, 15, 5, 5));

    const vista = projectMonth(salvo, "2026-10");
    expect(vista.budget).toEqual({ born: true, inheritedFrom: null });
    expect(percentuaisDe(vista)).toEqual([40, 20, 15, 15, 5, 5]);
  });

  it("editar outubro não altera setembro nem um novembro já nascido", () => {
    const estado: State = {
      ...emptyState(),
      budgets: {
        "2026-09": pcts(30, 25, 15, 15, 10, 5),
        "2026-10": pcts(30, 25, 15, 15, 10, 5),
        "2026-11": pcts(35, 20, 15, 15, 10, 5),
      },
    };

    const salvo = salvar(estado, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    expect(percentuaisDe(projectMonth(salvo, "2026-09"))).toEqual([30, 25, 15, 15, 10, 5]);
    expect(percentuaisDe(projectMonth(salvo, "2026-10"))).toEqual([40, 20, 15, 10, 10, 5]);
    expect(percentuaisDe(projectMonth(salvo, "2026-11"))).toEqual([35, 20, 15, 15, 10, 5]);
  });

  it("um novembro não nascido passa a exibir os percentuais de outubro", () => {
    const estado: State = {
      ...emptyState(),
      budgets: { "2026-09": pcts(30, 25, 15, 15, 10, 5), "2026-10": pcts(30, 25, 15, 15, 10, 5) },
    };

    const salvo = salvar(estado, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    const novembro = projectMonth(salvo, "2026-11");
    expect(novembro.budget).toEqual({ born: false, inheritedFrom: "2026-10" });
    expect(percentuaisDe(novembro)).toEqual([40, 20, 15, 10, 10, 5]);
  });

  it("aplicar não muda o estado recebido", () => {
    const estado: State = { ...emptyState(), budgets: { "2026-10": pcts(30, 25, 15, 15, 10, 5) } };

    salvar(estado, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    expect(estado.budgets["2026-10"]).toEqual(pcts(30, 25, 15, 15, 10, 5));
  });
});

describe("validação dos percentuais", () => {
  it("soma acima de 100 é recusada, dizendo quanto passou", () => {
    const resultado = apply(emptyState(), salvarPercentuais("2026-10", pcts(40, 25, 15, 15, 10, 5)), HOJE);

    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/10 pontos/) });
  });

  it("soma abaixo de 100 é aceita, e o resto fica não alocado", () => {
    const salvo = salvar(emptyState(), "2026-10", pcts(30, 20, 15, 15, 5, 5));

    expect(projectMonth(salvo, "2026-10").unallocated.percentage).toBe(10);
  });

  it("soma exatamente 100 é aceita, inclusive com um pote em 100 e os outros em 0", () => {
    expect(apply(emptyState(), salvarPercentuais("2026-10", pcts(100, 0, 0, 0, 0, 0)), HOJE).ok).toBe(true);
  });

  it.each([
    ["percentual negativo", pcts(-5, 25, 15, 15, 10, 5)],
    ["percentual acima de 100", pcts(101, 0, 0, 0, 0, 0)],
    ["percentual fracionário", pcts(29.5, 25, 15, 15, 10, 5)],
    ["percentual que não é número", pcts("30" as never, 25, 15, 15, 10, 5)],
    ["pote faltando, num comando malformado", { ...pcts(30, 25, 15, 15, 10, 5), pleasures: undefined as never }],
  ])("%s é recusado", (_, percentuais) => {
    expect(apply(emptyState(), salvarPercentuais("2026-10", percentuais), HOJE).ok).toBe(false);
  });

  it("um pote que não é um dos seis é recusado", () => {
    const percentuais = { ...pcts(30, 25, 15, 15, 10, 0), viagens: 5 } as Percentages;

    expect(apply(emptyState(), salvarPercentuais("2026-10", percentuais), HOJE).ok).toBe(false);
  });

  it.each(["2026-13", "2026-9", "outubro", ""])("mês malformado %j é recusado", (mes) => {
    expect(apply(emptyState(), salvarPercentuais(mes as Month, pcts(30, 25, 15, 15, 10, 5)), HOJE).ok).toBe(false);
  });

  it("um comando recusado não faz o mês nascer", () => {
    const estado = emptyState();

    apply(estado, salvarPercentuais("2026-10", pcts(50, 25, 15, 15, 10, 5)), HOJE);

    expect(projectMonth(estado, "2026-10").budget.born).toBe(false);
  });
});

describe("projeção com os percentuais que se digitam", () => {
  const comReceita = (): State => ({
    ...emptyState(),
    budgets: { "2026-10": pcts(30, 25, 15, 15, 10, 5) },
    incomes: [{ id: 1, date: "2026-10-05", description: "Salário", source: "salary", paymentMethod: "transfer", amount: 1_000_000, deletedAt: null }],
  });

  it("recalcula limites e não alocado com o rascunho, sem gravar nada", () => {
    const estado = comReceita();

    const vista = projectMonth(estado, "2026-10", pcts(40, 20, 15, 10, 5, 0));

    expect(percentuaisDe(vista)).toEqual([40, 20, 15, 10, 5, 0]);
    expect(vista.jars.map((p) => p.limit)).toEqual([400_000, 200_000, 150_000, 100_000, 50_000, 0]);
    expect(vista.unallocated).toEqual({ percentage: 10, amount: 100_000 });
    expect(projectMonth(estado, "2026-10").jars.map((p) => p.percentage)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("o rascunho num mês não nascido não o faz parecer nascido", () => {
    const vista = projectMonth(emptyState(), "2026-11", pcts(40, 20, 15, 10, 5, 0));

    expect(vista.budget).toEqual({ born: false, inheritedFrom: null });
    expect(percentuaisDe(vista)).toEqual([40, 20, 15, 10, 5, 0]);
  });

  it("um rascunho que passa de 100 deixa o não alocado em zero, nunca negativo", () => {
    const vista = projectMonth(comReceita(), "2026-10", pcts(50, 25, 15, 15, 10, 5));

    expect(vista.unallocated).toEqual({ percentage: 0, amount: 0 });
  });
});

function salvarPercentuais(mes: Month, percentuais: Percentages): Command {
  return { type: "save-percentages", month: mes, percentages: percentuais };
}

function salvar(estado: State, mes: Month, percentuais: Percentages): State {
  const resultado = apply(estado, salvarPercentuais(mes, percentuais), HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((p, i) => [p.id, valores[i]])) as Percentages;
}

function percentuaisDe(vista: MonthView): number[] {
  return vista.jars.map((p) => p.percentage);
}
