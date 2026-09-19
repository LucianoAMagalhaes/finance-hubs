import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicar, estadoVazio, POTES, projetarMes, type Comando, type Estado, type Percentuais, type PoteId } from "@/dominio";
import { abrirBanco, carregarEstado, gravarEstado, type Banco } from "@/persistencia";

let pasta: string;
let arquivo: string;
const abertos: Banco[] = [];

function abrir(): Banco {
  const banco = abrirBanco(arquivo);
  abertos.push(banco);
  return banco;
}

beforeEach(() => {
  pasta = mkdtempSync(path.join(tmpdir(), "finance-hubs-"));
  arquivo = path.join(pasta, "dados", "finance-hubs.db");
});

afterEach(() => {
  for (const banco of abertos.splice(0)) banco.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

describe("persistência", () => {
  it("um banco novo começa com o estado vazio", () => {
    expect(carregarEstado(abrir())).toEqual(estadoVazio());
  });

  it("um orçamento gravado volta idêntico ao recarregar do banco", () => {
    const estado: Estado = {
      ...estadoVazio(),
      orcamentos: {
        "2026-08": pcts(30, 25, 15, 15, 10, 5),
        "2026-09": pcts(30, 20, 20, 15, 10, 0),
      },
    };
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-08", "2026-09", "2026-10"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
  });

  it("gravar de novo um mês que já existe troca os seus percentuais", () => {
    const banco = abrir();
    gravarEstado(banco, { ...estadoVazio(), orcamentos: { "2026-09": pcts(30, 25, 15, 15, 10, 5) } });

    gravarEstado(banco, { ...estadoVazio(), orcamentos: { "2026-09": pcts(40, 20, 15, 15, 10, 0) } });

    expect(carregarEstado(abrir()).orcamentos["2026-09"]).toEqual(pcts(40, 20, 15, 15, 10, 0));
  });

  it("uma entrada gravada volta idêntica ao recarregar, com o mês que ela fez nascer", () => {
    const estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05", valor: 720_050 }));
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    expect(projetarMes(recarregado, "2026-09")).toEqual(projetarMes(estado, "2026-09"));
    expect(projetarMes(recarregado, "2026-09").orcamento.nascido).toBe(true);
  });

  it("corrigir a data de uma entrada grava a mudança e o mês de destino", () => {
    const banco = abrir();
    const antes = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-10-05" }));
    gravarEstado(banco, antes);
    const id = antes.entradas[0]!.id;

    const depois = aplicarOk(carregarEstado(banco), salvarEntrada({ id, data: "2026-09-30" }));
    gravarEstado(banco, depois);

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(projetarMes(recarregado, "2026-09").receita).toBe(720_000);
    expect(projetarMes(recarregado, "2026-10").receita).toBe(0);
  });

  it("percentuais salvos por comando voltam idênticos, sem mexer nos outros meses", () => {
    const banco = abrir();
    const antes = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));
    gravarEstado(banco, antes);

    const depois = aplicarOk(carregarEstado(banco), {
      tipo: "salvar-percentuais",
      mes: "2026-10",
      percentuais: pcts(40, 20, 15, 10, 5, 0),
    });
    gravarEstado(banco, depois);

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(recarregado.orcamentos["2026-10"]).toEqual(pcts(40, 20, 15, 10, 5, 0));
    expect(recarregado.orcamentos["2026-09"]).toEqual(pcts(30, 25, 15, 15, 10, 5));
  });

  it("um lançamento à vista, inclusive negativo, volta idêntico ao recarregar", () => {
    let estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 42_050 }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-19", pote: "conforto", valor: -29_790 }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-10-02", pote: "metas", valor: 10_000 }));
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-09", "2026-10"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
    expect(recarregado.orcamentos["2026-10"]).toBeDefined();
  });

  it("corrigir um lançamento grava a mudança", () => {
    const banco = abrir();
    const antes = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 42_050 }));
    gravarEstado(banco, antes);
    const id = antes.lancamentos[0]!.id;

    const depois = aplicarOk(carregarEstado(banco), salvarLancamento({ id, data: "2026-09-12", pote: "metas", valor: -500 }));
    gravarEstado(banco, depois);

    expect(carregarEstado(abrir())).toEqual(depois);
  });

  it("o orçamento nascido e a entrada entram na mesma transação: ou os dois, ou nenhum", () => {
    const estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));
    // Uma entrada que o banco recusa (descrição nula), gravada depois do orçamento.
    const quebrado: Estado = { ...estado, entradas: [{ ...estado.entradas[0]!, descricao: null as never }] };

    expect(() => gravarEstado(abrir(), quebrado)).toThrow();

    expect(carregarEstado(abrir())).toEqual(estadoVazio());
  });
});

function salvarEntrada(campos: { id?: number; data: `${number}-${number}-${number}`; valor?: number }): Comando {
  return {
    tipo: "salvar-entrada",
    entrada: { descricao: "Salário", fonte: "salario", tipo: "transferencia", valor: 720_000, ...campos },
  };
}

function salvarLancamento(campos: {
  id?: number;
  data: `${number}-${number}-${number}`;
  pote: PoteId;
  valor: number;
}): Comando {
  return {
    tipo: "salvar-lancamento",
    lancamento: { descricao: "Restaurante", tipo: "cartao-de-credito", parcelas: 1, ...campos },
  };
}

function aplicarOk(estado: Estado, comando: Comando): Estado {
  const resultado = aplicar(estado, comando, "2026-09-18");
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentuais {
  return Object.fromEntries(POTES.map((p, i) => [p.id, valores[i]])) as Percentuais;
}
