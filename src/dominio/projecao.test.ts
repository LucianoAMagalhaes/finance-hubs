import { describe, expect, it } from "vitest";
import {
  estadoVazio,
  POTES,
  projetarMes,
  type Estado,
  type Percentuais,
  type VistaDoMes,
} from "@/dominio";

describe("projeção do mês", () => {
  it("num estado vazio, o mês herda os percentuais padrão e não nasceu", () => {
    const vista = projetarMes(estadoVazio(), "2026-09");

    expect(vista.orcamento).toEqual({ nascido: false, herdadoDe: null });
    expect(vista.potes.map((p) => [p.nome, p.percentual])).toEqual([
      ["Custos Fixos", 30],
      ["Liberdade Financeira", 25],
      ["Conforto", 15],
      ["Metas", 15],
      ["Conhecimento", 10],
      ["Prazeres", 5],
    ]);
  });

  it("um mês sem orçamento herda do mês anterior no tempo mais recente que tem o seu", () => {
    const estado: Estado = {
      ...estadoVazio(),
      orcamentos: {
        "2026-01": pcts(40, 20, 10, 10, 10, 10),
        "2026-03": pcts(35, 25, 15, 15, 5, 5),
        "2026-06": pcts(20, 20, 20, 20, 10, 10),
      },
    };

    const vista = projetarMes(estado, "2026-05");

    expect(vista.orcamento).toEqual({ nascido: false, herdadoDe: "2026-03" });
    expect(percentuaisDe(vista)).toEqual([35, 25, 15, 15, 5, 5]);
  });

  it("dezembro herda de outubro mesmo com janeiro seguinte já nascido", () => {
    const estado: Estado = {
      ...estadoVazio(),
      orcamentos: {
        "2026-10": pcts(30, 30, 10, 10, 10, 10),
        "2027-01": pcts(50, 10, 10, 10, 10, 10),
      },
    };

    const vista = projetarMes(estado, "2026-12");

    expect(vista.orcamento.herdadoDe).toBe("2026-10");
    expect(percentuaisDe(vista)).toEqual([30, 30, 10, 10, 10, 10]);
  });

  it("um mês anterior a todos os nascidos herda os padrão", () => {
    const estado: Estado = { ...estadoVazio(), orcamentos: { "2026-09": pcts(50, 10, 10, 10, 10, 10) } };

    const vista = projetarMes(estado, "2026-03");

    expect(vista.orcamento).toEqual({ nascido: false, herdadoDe: null });
    expect(percentuaisDe(vista)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("um mês nascido mostra os seus próprios percentuais", () => {
    const estado: Estado = {
      ...estadoVazio(),
      orcamentos: {
        "2026-08": pcts(30, 25, 15, 15, 10, 5),
        "2026-09": pcts(30, 20, 20, 15, 10, 5),
      },
    };

    const vista = projetarMes(estado, "2026-09");

    expect(vista.orcamento).toEqual({ nascido: true, herdadoDe: null });
    expect(percentuaisDe(vista)).toEqual([30, 20, 20, 15, 10, 5]);
  });

  it("sem entrada no mês, nenhum pote tem limite nem veredito além de 'sem receita'", () => {
    const vista = projetarMes(estadoVazio(), "2026-09");

    expect(vista.receita).toBe(0);
    for (const pote of vista.potes) {
      expect(pote).toMatchObject({ total: 0, limite: null, veredito: "sem-receita" });
    }
  });

  it("sem registro nenhum, os quatro agregados do mês são zero", () => {
    const vista = projetarMes(estadoVazio(), "2026-09");

    expect(vista.agregados).toEqual({ receitas: 0, despesas: 0, saldoDoMes: 0, saldoEmConta: 0 });
  });

  it("o não alocado é o que os seis percentuais deixam de fora", () => {
    const estado: Estado = { ...estadoVazio(), orcamentos: { "2026-09": pcts(30, 20, 15, 15, 5, 5) } };

    expect(projetarMes(estado, "2026-09").naoAlocado.percentual).toBe(10);
    expect(projetarMes(estadoVazio(), "2026-09").naoAlocado.percentual).toBe(0);
  });

  it("projetar um mês não faz ele nascer", () => {
    const estado = estadoVazio();

    projetarMes(estado, "2026-09");

    expect(projetarMes(estado, "2026-09").orcamento.nascido).toBe(false);
  });
});

function pcts(...valores: [number, number, number, number, number, number]): Percentuais {
  return Object.fromEntries(POTES.map((p, i) => [p.id, valores[i]])) as Percentuais;
}

function percentuaisDe(vista: VistaDoMes): number[] {
  return vista.potes.map((p) => p.percentual);
}
