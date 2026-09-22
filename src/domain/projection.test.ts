import { describe, expect, it } from "vitest";
import {
  emptyState,
  JARS,
  projectMonth,
  type State,
  type Percentages,
  type MonthView,
} from "@/domain";

describe("projeção do mês", () => {
  it("num estado vazio, o mês herda os percentuais padrão e não nasceu", () => {
    const vista = projectMonth(emptyState(), "2026-09");

    expect(vista.budget).toEqual({ born: false, inheritedFrom: null });
    expect(vista.jars.map((p) => [p.name, p.percentage])).toEqual([
      ["Custos Fixos", 30],
      ["Liberdade Financeira", 25],
      ["Conforto", 15],
      ["Metas", 15],
      ["Conhecimento", 10],
      ["Prazeres", 5],
    ]);
  });

  it("um mês sem orçamento herda do mês anterior no tempo mais recente que tem o seu", () => {
    const estado: State = {
      ...emptyState(),
      budgets: {
        "2026-01": pcts(40, 20, 10, 10, 10, 10),
        "2026-03": pcts(35, 25, 15, 15, 5, 5),
        "2026-06": pcts(20, 20, 20, 20, 10, 10),
      },
    };

    const vista = projectMonth(estado, "2026-05");

    expect(vista.budget).toEqual({ born: false, inheritedFrom: "2026-03" });
    expect(percentuaisDe(vista)).toEqual([35, 25, 15, 15, 5, 5]);
  });

  it("dezembro herda de outubro mesmo com janeiro seguinte já nascido", () => {
    const estado: State = {
      ...emptyState(),
      budgets: {
        "2026-10": pcts(30, 30, 10, 10, 10, 10),
        "2027-01": pcts(50, 10, 10, 10, 10, 10),
      },
    };

    const vista = projectMonth(estado, "2026-12");

    expect(vista.budget.inheritedFrom).toBe("2026-10");
    expect(percentuaisDe(vista)).toEqual([30, 30, 10, 10, 10, 10]);
  });

  it("um mês anterior a todos os nascidos herda os padrão", () => {
    const estado: State = { ...emptyState(), budgets: { "2026-09": pcts(50, 10, 10, 10, 10, 10) } };

    const vista = projectMonth(estado, "2026-03");

    expect(vista.budget).toEqual({ born: false, inheritedFrom: null });
    expect(percentuaisDe(vista)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("um mês nascido mostra os seus próprios percentuais", () => {
    const estado: State = {
      ...emptyState(),
      budgets: {
        "2026-08": pcts(30, 25, 15, 15, 10, 5),
        "2026-09": pcts(30, 20, 20, 15, 10, 5),
      },
    };

    const vista = projectMonth(estado, "2026-09");

    expect(vista.budget).toEqual({ born: true, inheritedFrom: null });
    expect(percentuaisDe(vista)).toEqual([30, 20, 20, 15, 10, 5]);
  });

  it("sem entrada no mês, nenhum pote tem limite nem veredito além de 'sem receita'", () => {
    const vista = projectMonth(emptyState(), "2026-09");

    expect(vista.monthIncome).toBe(0);
    for (const pote of vista.jars) {
      expect(pote).toMatchObject({ total: 0, limit: null, verdict: "no-income" });
    }
  });

  it("sem registro nenhum, os quatro agregados do mês são zero", () => {
    const vista = projectMonth(emptyState(), "2026-09");

    expect(vista.aggregates).toEqual({ monthIncome: 0, monthExpenses: 0, monthBalance: 0, accountBalance: 0 });
  });

  it("o não alocado é o que os seis percentuais deixam de fora", () => {
    const estado: State = { ...emptyState(), budgets: { "2026-09": pcts(30, 20, 15, 15, 5, 5) } };

    expect(projectMonth(estado, "2026-09").unallocated.percentage).toBe(10);
    expect(projectMonth(emptyState(), "2026-09").unallocated.percentage).toBe(0);
  });

  it("projetar um mês não faz ele nascer", () => {
    const estado = emptyState();

    projectMonth(estado, "2026-09");

    expect(projectMonth(estado, "2026-09").budget.born).toBe(false);
  });
});

function pcts(...valores: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((p, i) => [p.id, valores[i]])) as Percentages;
}

function percentuaisDe(vista: MonthView): number[] {
  return vista.jars.map((p) => p.percentage);
}
