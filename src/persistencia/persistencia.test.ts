import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  POTES,
  projetarMes,
  tagsEmUso,
  type Comando,
  type Compra,
  type Estado,
  type Mes,
  type Percentuais,
  type PoteId,
  type Recorrente,
  type VigenciaASalvar,
} from "@/dominio";
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

  it("um parcelado, inclusive reembolso parcelado, volta idêntico ao recarregar", () => {
    let estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-08-31", pote: "conforto", valor: 389_900, parcelas: 10 }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-10", pote: "conforto", valor: -100_000, parcelas: 3 }));
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-08", "2026-09", "2026-11", "2027-05", "2027-06"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
    // Em ordem de data: o reembolso cai no dia 10; a compra do dia 31, no último dia de novembro.
    expect(projetarMes(recarregado, "2026-11").ocorrencias.map((o) => [o.data, o.parcela])).toEqual([
      ["2026-11-10", { numero: 3, de: 3, total: -100_000 }],
      ["2026-11-30", { numero: 4, de: 10, total: 389_900 }],
    ]);
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

  it("a tag gravada volta normalizada, e sem tag volta sem tag", () => {
    let estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 4_000, tag: "#Saúde Mental" }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-13", pote: "conforto", valor: 2_000 }));
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado.lancamentos.map((l) => (l as Compra).tag)).toEqual(["saúde-mental", null]);
    expect(recarregado).toEqual(estado);
    expect(projetarMes(recarregado, "2026-09")).toEqual(projetarMes(estado, "2026-09"));
  });

  it("a marca de lixeira sobrevive a recarregar, e restaurar a tira do banco", () => {
    const banco = abrir();
    let estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 100_000, parcelas: 3 }));
    const antes = aplicarOk(estado, { tipo: "apagar", registro: "entrada", id: 1 });
    const apagado = aplicarOk(antes, { tipo: "apagar", registro: "lancamento", id: 1 });
    gravarEstado(banco, apagado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(apagado);
    expect(recarregado.entradas[0]!.apagadoEm).toBe("2026-09-18");
    expect(recarregado.lancamentos[0]!.apagadoEm).toBe("2026-09-18");
    for (const mes of ["2026-09", "2026-10", "2026-11"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(apagado, mes));
      expect(projetarMes(recarregado, mes).ocorrencias).toEqual([]);
    }
    expect(projetarMes(recarregado, "2026-09").receita).toBe(0);
    expect(recarregado.orcamentos["2026-09"]).toBeDefined();

    const restaurado = aplicarOk(recarregado, { tipo: "restaurar", registro: "lancamento", id: 1 });
    gravarEstado(banco, restaurado);

    expect(carregarEstado(abrir())).toEqual(restaurado);
    expect(carregarEstado(abrir()).lancamentos[0]!.apagadoEm).toBeNull();
  });

  it("as antecipações de um parcelado voltam idênticas ao recarregar, com a série já cortada", () => {
    let estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-01-15", pote: "conforto", valor: 389_900, parcelas: 10 }));
    estado = aplicarOk(estado, antecipar({ data: "2026-07-20", parcelas: 1, valor: 36_000 }));
    estado = aplicarOk(estado, antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }));
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    expect((recarregado.lancamentos[0] as Compra).antecipacoes).toEqual([
      { id: 1, data: "2026-07-20", parcelas: 1, valor: 36_000, apagadoEm: null },
      { id: 2, data: "2026-08-10", parcelas: 1, valor: 35_000, apagadoEm: null },
    ]);
    for (const mes of ["2026-07", "2026-08", "2026-09", "2026-10"] as const) {
      expect(projetarMes(recarregado, mes), mes).toEqual(projetarMes(estado, mes));
    }
    expect(projetarMes(recarregado, "2026-09").ocorrencias).toEqual([]);
  });

  it("corrigir uma antecipação não muda o lugar dela: o estado gravado volta idêntico", () => {
    const banco = abrir();
    let antes = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-01-15", pote: "conforto", valor: 389_900, parcelas: 10 }));
    antes = aplicarOk(antes, antecipar({ data: "2026-07-20", parcelas: 1, valor: 36_000 }));
    antes = aplicarOk(antes, antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }));
    gravarEstado(banco, antes);

    const depois = aplicarOk(carregarEstado(banco), antecipar({ id: 1, data: "2026-07-20", parcelas: 1, valor: 30_000 }));
    gravarEstado(banco, depois);

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect((recarregado.lancamentos[0] as Compra).antecipacoes.map((a) => [a.id, a.valor])).toEqual([
      [1, 30_000],
      [2, 35_000],
    ]);
  });

  it("uma antecipação desfeita volta da lixeira pelo banco, e as parcelas voltam com ela", () => {
    const banco = abrir();
    let antes = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-01-15", pote: "conforto", valor: 389_900, parcelas: 10 }));
    antes = aplicarOk(antes, antecipar({ data: "2026-07-20", parcelas: 3, valor: 300_000 }));
    const desfeita = aplicarOk(antes, { tipo: "apagar", registro: "antecipacao", id: 1 });
    gravarEstado(banco, desfeita);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(desfeita);
    expect((recarregado.lancamentos[0] as Compra).antecipacoes[0]!.apagadoEm).toBe("2026-09-18");
    expect(projetarMes(recarregado, "2026-10").ocorrencias).toHaveLength(1);

    const restaurada = aplicarOk(recarregado, { tipo: "restaurar", registro: "antecipacao", id: 1 });
    gravarEstado(banco, restaurada);

    expect(carregarEstado(abrir())).toEqual(antes);
  });

  it("um recorrente com várias vigências, inclusive encerrado ou reembolso, volta idêntico ao recarregar", () => {
    let estado = aplicarOk(estadoVazio(), criarRecorrente({ data: "2026-01-31", valor: 150_000, tag: "casa" }));
    estado = aplicarOk(estado, mudarRecorrente(1, "2026-03", { valor: 155_000, pote: "metas", tag: null }));
    estado = aplicarOk(estado, mudarRecorrente(1, "2026-07", { valor: 165_000, tag: "#Moradia" }));
    estado = aplicarOk(estado, criarRecorrente({ data: "2026-02-10", valor: -2_000 }));
    estado = aplicarOk(estado, { tipo: "encerrar-recorrente", id: 2, mes: "2026-06" });
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-01", "2026-02", "2026-03", "2026-05", "2026-06", "2026-07", "2030-02"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
    expect(projetarMes(recarregado, "2028-02").ocorrencias.map((o) => [o.data, o.valor, o.tag])).toEqual([["2028-02-29", 165_000, "moradia"]]);
  });

  it("compras e recorrentes voltam na ordem em que foram lançados", () => {
    let estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 1_000 }));
    estado = aplicarOk(estado, criarRecorrente({ data: "2026-09-05" }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-13", pote: "conforto", valor: 2_000 }));
    gravarEstado(abrir(), estado);

    expect(carregarEstado(abrir()).lancamentos.map((l) => [l.id, l.forma])).toEqual([
      [1, "compra"],
      [2, "recorrente"],
      [3, "compra"],
    ]);
  });

  it("encerrar grava o fim e apaga do banco as vigências descartadas", () => {
    const banco = abrir();
    let antes = aplicarOk(estadoVazio(), criarRecorrente({ data: "2026-01-05" }));
    antes = aplicarOk(antes, mudarRecorrente(1, "2026-10", { valor: 11_000 }));
    antes = aplicarOk(antes, mudarRecorrente(1, "2026-12", { valor: 12_000 }));
    gravarEstado(banco, antes);

    const depois = aplicarOk(carregarEstado(banco), { tipo: "encerrar-recorrente", id: 1, mes: "2026-09" });
    gravarEstado(banco, depois);

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(projetarMes(recarregado, "2026-12").ocorrencias).toEqual([]);
  });

  it("encerrar é gravado numa transação só: se uma linha falha, o fim e as vigências ficam como estavam", () => {
    const banco = abrir();
    let antes = aplicarOk(estadoVazio(), criarRecorrente({ data: "2026-01-05" }));
    antes = aplicarOk(antes, mudarRecorrente(1, "2026-05", { valor: 11_000 }));
    antes = aplicarOk(antes, mudarRecorrente(1, "2026-10", { valor: 12_000 }));
    gravarEstado(banco, antes);
    const encerrado = aplicarOk(antes, { tipo: "encerrar-recorrente", id: 1, mes: "2026-09" });
    // Uma vigência que o banco recusa (descrição nula), gravada depois do fim e da limpeza das descartadas.
    const r = encerrado.lancamentos[0] as Recorrente;
    const quebrado: Estado = {
      ...encerrado,
      lancamentos: [{ ...r, vigencias: [r.vigencias[0]!, { ...r.vigencias[1]!, descricao: null as never }] }],
    };

    expect(() => gravarEstado(banco, quebrado)).toThrow();

    expect(carregarEstado(abrir())).toEqual(antes);
  });

  it("renomear uma tag grava o nome novo nas compras e nas vigências, em todos os meses", () => {
    const banco = abrir();
    let antes = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-01-10", pote: "conforto", valor: 30_000, tag: "transporte" }));
    antes = aplicarOk(antes, salvarLancamento({ data: "2026-02-05", pote: "conforto", valor: 120_000, parcelas: 12, tag: "uber" }));
    antes = aplicarOk(antes, criarRecorrente({ data: "2026-01-15", tag: "transporte" }));
    antes = aplicarOk(antes, mudarRecorrente(3, "2026-06", { valor: 28_000, tag: "uber" }));
    gravarEstado(banco, antes);

    // A fusão junta as duas: uma compra, um parcelado e as duas vigências passam a #uber.
    const depois = aplicarOk(carregarEstado(banco), { tipo: "renomear-tag", de: "transporte", para: "uber", fundir: true });
    gravarEstado(banco, depois);

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(recarregado.lancamentos.map((l) => (l.forma === "compra" ? l.tag : l.vigencias.map((v) => v.tag)))).toEqual([
      "uber",
      "uber",
      ["uber", "uber"],
    ]);
    for (const mes of ["2026-01", "2026-02", "2026-06", "2027-01"] as const) {
      expect(projetarMes(recarregado, mes), mes).toEqual(projetarMes(depois, mes));
    }
  });

  it("renomear é gravado numa transação só: se uma linha falha, nenhum lançamento troca de tag", () => {
    const banco = abrir();
    let antes = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-01-10", pote: "conforto", valor: 30_000, tag: "transporte" }));
    antes = aplicarOk(antes, criarRecorrente({ data: "2026-01-15", tag: "transporte" }));
    gravarEstado(banco, antes);
    const renomeado = aplicarOk(antes, { tipo: "renomear-tag", de: "transporte", para: "mobilidade", fundir: false });
    // Uma vigência que o banco recusa (descrição nula), gravada depois da compra já renomeada.
    const r = renomeado.lancamentos[1] as Recorrente;
    const quebrado: Estado = {
      ...renomeado,
      lancamentos: [renomeado.lancamentos[0]!, { ...r, vigencias: [{ ...r.vigencias[0]!, descricao: null as never }] }],
    };

    expect(() => gravarEstado(banco, quebrado)).toThrow();

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(antes);
    // A compra é gravada antes do recorrente: sem a transação, ela teria ficado com o nome novo.
    expect((recarregado.lancamentos[0] as Compra).tag).toBe("transporte");
    expect(tagsEmUso(recarregado)).toEqual(["transporte"]);
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

function antecipar(campos: { id?: number; data: `${number}-${number}-${number}`; parcelas: number; valor: number }): Comando {
  return { tipo: "salvar-antecipacao", antecipacao: { lancamento: 1, ...campos } };
}

function salvarLancamento(campos: {
  id?: number;
  data: `${number}-${number}-${number}`;
  pote: PoteId;
  valor: number;
  parcelas?: number;
  tag?: string;
}): Comando {
  return {
    tipo: "salvar-lancamento",
    lancamento: { descricao: "Restaurante", tipo: "cartao-de-credito", parcelas: 1, ...campos },
  };
}

function criarRecorrente(campos: Partial<VigenciaASalvar> & { data: `${number}-${number}-${number}` }): Comando {
  return {
    tipo: "criar-recorrente",
    recorrente: { descricao: "Aluguel", pote: "custos-fixos", tipo: "boleto", valor: 10_000, ...campos },
  };
}

function mudarRecorrente(id: number, mes: Mes, campos: Partial<VigenciaASalvar>): Comando {
  return {
    tipo: "mudar-recorrente",
    id,
    mes,
    vigencia: { descricao: "Aluguel", pote: "custos-fixos", tipo: "boleto", valor: 10_000, ...campos },
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
