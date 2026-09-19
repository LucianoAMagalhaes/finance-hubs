import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  POTES,
  projetarMes,
  type Comando,
  type Data,
  type Estado,
  type Mes,
  type Percentuais,
  type VistaDoMes,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

describe("editar os percentuais do mês", () => {
  it("salvar percentuais num mês não nascido o faz nascer com os valores salvos", () => {
    const salvo = salvar(estadoVazio(), "2026-10", pcts(40, 20, 15, 15, 5, 5));

    const vista = projetarMes(salvo, "2026-10");
    expect(vista.orcamento).toEqual({ nascido: true, herdadoDe: null });
    expect(percentuaisDe(vista)).toEqual([40, 20, 15, 15, 5, 5]);
  });

  it("editar outubro não altera setembro nem um novembro já nascido", () => {
    const estado: Estado = {
      ...estadoVazio(),
      orcamentos: {
        "2026-09": pcts(30, 25, 15, 15, 10, 5),
        "2026-10": pcts(30, 25, 15, 15, 10, 5),
        "2026-11": pcts(35, 20, 15, 15, 10, 5),
      },
    };

    const salvo = salvar(estado, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    expect(percentuaisDe(projetarMes(salvo, "2026-09"))).toEqual([30, 25, 15, 15, 10, 5]);
    expect(percentuaisDe(projetarMes(salvo, "2026-10"))).toEqual([40, 20, 15, 10, 10, 5]);
    expect(percentuaisDe(projetarMes(salvo, "2026-11"))).toEqual([35, 20, 15, 15, 10, 5]);
  });

  it("um novembro não nascido passa a exibir os percentuais de outubro", () => {
    const estado: Estado = {
      ...estadoVazio(),
      orcamentos: { "2026-09": pcts(30, 25, 15, 15, 10, 5), "2026-10": pcts(30, 25, 15, 15, 10, 5) },
    };

    const salvo = salvar(estado, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    const novembro = projetarMes(salvo, "2026-11");
    expect(novembro.orcamento).toEqual({ nascido: false, herdadoDe: "2026-10" });
    expect(percentuaisDe(novembro)).toEqual([40, 20, 15, 10, 10, 5]);
  });

  it("aplicar não muda o estado recebido", () => {
    const estado: Estado = { ...estadoVazio(), orcamentos: { "2026-10": pcts(30, 25, 15, 15, 10, 5) } };

    salvar(estado, "2026-10", pcts(40, 20, 15, 10, 10, 5));

    expect(estado.orcamentos["2026-10"]).toEqual(pcts(30, 25, 15, 15, 10, 5));
  });
});

describe("validação dos percentuais", () => {
  it("soma acima de 100 é recusada, dizendo quanto passou", () => {
    const resultado = aplicar(estadoVazio(), salvarPercentuais("2026-10", pcts(40, 25, 15, 15, 10, 5)), HOJE);

    expect(resultado).toEqual({ ok: false, erro: expect.stringMatching(/10 pontos/) });
  });

  it("soma abaixo de 100 é aceita, e o resto fica não alocado", () => {
    const salvo = salvar(estadoVazio(), "2026-10", pcts(30, 20, 15, 15, 5, 5));

    expect(projetarMes(salvo, "2026-10").naoAlocado.percentual).toBe(10);
  });

  it("soma exatamente 100 é aceita, inclusive com um pote em 100 e os outros em 0", () => {
    expect(aplicar(estadoVazio(), salvarPercentuais("2026-10", pcts(100, 0, 0, 0, 0, 0)), HOJE).ok).toBe(true);
  });

  it.each([
    ["percentual negativo", pcts(-5, 25, 15, 15, 10, 5)],
    ["percentual acima de 100", pcts(101, 0, 0, 0, 0, 0)],
    ["percentual fracionário", pcts(29.5, 25, 15, 15, 10, 5)],
    ["percentual que não é número", pcts("30" as never, 25, 15, 15, 10, 5)],
    ["pote faltando, num comando malformado", { ...pcts(30, 25, 15, 15, 10, 5), prazeres: undefined as never }],
  ])("%s é recusado", (_, percentuais) => {
    expect(aplicar(estadoVazio(), salvarPercentuais("2026-10", percentuais), HOJE).ok).toBe(false);
  });

  it("um pote que não é um dos seis é recusado", () => {
    const percentuais = { ...pcts(30, 25, 15, 15, 10, 0), viagens: 5 } as Percentuais;

    expect(aplicar(estadoVazio(), salvarPercentuais("2026-10", percentuais), HOJE).ok).toBe(false);
  });

  it.each(["2026-13", "2026-9", "outubro", ""])("mês malformado %j é recusado", (mes) => {
    expect(aplicar(estadoVazio(), salvarPercentuais(mes as Mes, pcts(30, 25, 15, 15, 10, 5)), HOJE).ok).toBe(false);
  });

  it("um comando recusado não faz o mês nascer", () => {
    const estado = estadoVazio();

    aplicar(estado, salvarPercentuais("2026-10", pcts(50, 25, 15, 15, 10, 5)), HOJE);

    expect(projetarMes(estado, "2026-10").orcamento.nascido).toBe(false);
  });
});

describe("projeção com os percentuais que se digitam", () => {
  const comReceita = (): Estado => ({
    ...estadoVazio(),
    orcamentos: { "2026-10": pcts(30, 25, 15, 15, 10, 5) },
    entradas: [{ id: 1, data: "2026-10-05", descricao: "Salário", fonte: "salario", tipo: "transferencia", valor: 1_000_000, apagadoEm: null }],
  });

  it("recalcula limites e não alocado com o rascunho, sem gravar nada", () => {
    const estado = comReceita();

    const vista = projetarMes(estado, "2026-10", pcts(40, 20, 15, 10, 5, 0));

    expect(percentuaisDe(vista)).toEqual([40, 20, 15, 10, 5, 0]);
    expect(vista.potes.map((p) => p.limite)).toEqual([400_000, 200_000, 150_000, 100_000, 50_000, 0]);
    expect(vista.naoAlocado).toEqual({ percentual: 10, valor: 100_000 });
    expect(projetarMes(estado, "2026-10").potes.map((p) => p.percentual)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("o rascunho num mês não nascido não o faz parecer nascido", () => {
    const vista = projetarMes(estadoVazio(), "2026-11", pcts(40, 20, 15, 10, 5, 0));

    expect(vista.orcamento).toEqual({ nascido: false, herdadoDe: null });
    expect(percentuaisDe(vista)).toEqual([40, 20, 15, 10, 5, 0]);
  });

  it("um rascunho que passa de 100 deixa o não alocado em zero, nunca negativo", () => {
    const vista = projetarMes(comReceita(), "2026-10", pcts(50, 25, 15, 15, 10, 5));

    expect(vista.naoAlocado).toEqual({ percentual: 0, valor: 0 });
  });
});

function salvarPercentuais(mes: Mes, percentuais: Percentuais): Comando {
  return { tipo: "salvar-percentuais", mes, percentuais };
}

function salvar(estado: Estado, mes: Mes, percentuais: Percentuais): Estado {
  const resultado = aplicar(estado, salvarPercentuais(mes, percentuais), HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentuais {
  return Object.fromEntries(POTES.map((p, i) => [p.id, valores[i]])) as Percentuais;
}

function percentuaisDe(vista: VistaDoMes): number[] {
  return vista.potes.map((p) => p.percentual);
}
