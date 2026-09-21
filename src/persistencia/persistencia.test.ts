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
import { abrirBanco, carregarEstado, executarNoBanco, type Banco } from "@/persistencia";
import { gravar } from "./repositorio";

const HOJE = "2026-09-18";

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

  it("percentuais de vários meses voltam idênticos ao recarregar do banco", () => {
    const estado = executarOk(
      abrir(),
      salvarPercentuais("2026-08", pcts(30, 25, 15, 15, 10, 5)),
      salvarPercentuais("2026-09", pcts(30, 20, 20, 15, 10, 0)),
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-08", "2026-09", "2026-10"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
  });

  it("salvar de novo um mês que já existe troca os seus percentuais", () => {
    const banco = abrir();
    executarOk(banco, salvarPercentuais("2026-09", pcts(30, 25, 15, 15, 10, 5)));

    executarOk(banco, salvarPercentuais("2026-09", pcts(40, 20, 15, 15, 10, 0)));

    expect(carregarEstado(abrir()).orcamentos["2026-09"]).toEqual(pcts(40, 20, 15, 15, 10, 0));
  });

  it("uma entrada gravada volta idêntica ao recarregar, com o mês que ela fez nascer", () => {
    const estado = executarOk(abrir(), salvarEntrada({ data: "2026-09-05", valor: 720_050 }));

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    expect(projetarMes(recarregado, "2026-09")).toEqual(projetarMes(estado, "2026-09"));
    expect(projetarMes(recarregado, "2026-09").orcamento.nascido).toBe(true);
  });

  it("corrigir a data de uma entrada grava a mudança e o mês de destino", () => {
    const banco = abrir();
    const antes = executarOk(banco, salvarEntrada({ data: "2026-10-05" }));
    const id = antes.entradas[0]!.id;

    const depois = executarOk(banco, salvarEntrada({ id, data: "2026-09-30" }));

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(projetarMes(recarregado, "2026-09").receita).toBe(720_000);
    expect(projetarMes(recarregado, "2026-10").receita).toBe(0);
  });

  it("percentuais salvos por comando voltam idênticos, sem mexer nos outros meses", () => {
    const banco = abrir();
    executarOk(banco, salvarEntrada({ data: "2026-09-05" }));

    const depois = executarOk(banco, salvarPercentuais("2026-10", pcts(40, 20, 15, 10, 5, 0)));

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(recarregado.orcamentos["2026-10"]).toEqual(pcts(40, 20, 15, 10, 5, 0));
    expect(recarregado.orcamentos["2026-09"]).toEqual(pcts(30, 25, 15, 15, 10, 5));
  });

  it("um lançamento à vista, inclusive negativo, volta idêntico ao recarregar", () => {
    const estado = executarOk(
      abrir(),
      salvarEntrada({ data: "2026-09-05" }),
      salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 42_050 }),
      salvarLancamento({ data: "2026-09-19", pote: "conforto", valor: -29_790 }),
      salvarLancamento({ data: "2026-10-02", pote: "metas", valor: 10_000 }),
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-09", "2026-10"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
    expect(recarregado.orcamentos["2026-10"]).toBeDefined();
  });

  it("um parcelado, inclusive reembolso parcelado, volta idêntico ao recarregar", () => {
    const estado = executarOk(
      abrir(),
      salvarLancamento({ data: "2026-08-31", pote: "conforto", valor: 389_900, parcelas: 10 }),
      salvarLancamento({ data: "2026-09-10", pote: "conforto", valor: -100_000, parcelas: 3 }),
    );

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
    const antes = executarOk(banco, salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 42_050 }));
    const id = antes.lancamentos[0]!.id;

    const depois = executarOk(banco, salvarLancamento({ id, data: "2026-09-12", pote: "metas", valor: -500 }));

    expect(carregarEstado(abrir())).toEqual(depois);
  });

  it("a tag gravada volta normalizada, e sem tag volta sem tag", () => {
    const estado = executarOk(
      abrir(),
      salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 4_000, tag: "#Saúde Mental" }),
      salvarLancamento({ data: "2026-09-13", pote: "conforto", valor: 2_000 }),
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado.lancamentos.map((l) => (l as Compra).tag)).toEqual(["saúde-mental", null]);
    expect(recarregado).toEqual(estado);
    expect(projetarMes(recarregado, "2026-09")).toEqual(projetarMes(estado, "2026-09"));
  });

  it("a marca de lixeira sobrevive a recarregar, e restaurar a tira do banco", () => {
    const banco = abrir();
    const apagado = executarOk(
      banco,
      salvarEntrada({ data: "2026-09-05" }),
      salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 100_000, parcelas: 3 }),
      { tipo: "apagar", registro: "entrada", id: 1 },
      { tipo: "apagar", registro: "lancamento", id: 1 },
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(apagado);
    expect(recarregado.entradas[0]!.apagadoEm).toBe(HOJE);
    expect(recarregado.lancamentos[0]!.apagadoEm).toBe(HOJE);
    for (const mes of ["2026-09", "2026-10", "2026-11"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(apagado, mes));
      expect(projetarMes(recarregado, mes).ocorrencias).toEqual([]);
    }
    expect(projetarMes(recarregado, "2026-09").receita).toBe(0);
    expect(recarregado.orcamentos["2026-09"]).toBeDefined();

    const restaurado = executarOk(banco, { tipo: "restaurar", registro: "lancamento", id: 1 });

    expect(carregarEstado(abrir())).toEqual(restaurado);
    expect(carregarEstado(abrir()).lancamentos[0]!.apagadoEm).toBeNull();
  });

  it("as antecipações de um parcelado voltam idênticas ao recarregar, com a série já cortada", () => {
    const estado = executarOk(
      abrir(),
      salvarLancamento({ data: "2026-01-15", pote: "conforto", valor: 389_900, parcelas: 10 }),
      antecipar({ data: "2026-07-20", parcelas: 1, valor: 36_000 }),
      antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }),
    );

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
    executarOk(
      banco,
      salvarLancamento({ data: "2026-01-15", pote: "conforto", valor: 389_900, parcelas: 10 }),
      antecipar({ data: "2026-07-20", parcelas: 1, valor: 36_000 }),
      antecipar({ data: "2026-08-10", parcelas: 1, valor: 35_000 }),
    );

    const depois = executarOk(banco, antecipar({ id: 1, data: "2026-07-20", parcelas: 1, valor: 30_000 }));

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect((recarregado.lancamentos[0] as Compra).antecipacoes.map((a) => [a.id, a.valor])).toEqual([
      [1, 30_000],
      [2, 35_000],
    ]);
  });

  it("uma antecipação desfeita volta da lixeira pelo banco, e as parcelas voltam com ela", () => {
    const banco = abrir();
    const antes = executarOk(
      banco,
      salvarLancamento({ data: "2026-01-15", pote: "conforto", valor: 389_900, parcelas: 10 }),
      antecipar({ data: "2026-07-20", parcelas: 3, valor: 300_000 }),
    );
    const desfeita = executarOk(banco, { tipo: "apagar", registro: "antecipacao", id: 1 });

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(desfeita);
    expect((recarregado.lancamentos[0] as Compra).antecipacoes[0]!.apagadoEm).toBe(HOJE);
    expect(projetarMes(recarregado, "2026-10").ocorrencias).toHaveLength(1);

    executarOk(banco, { tipo: "restaurar", registro: "antecipacao", id: 1 });

    expect(carregarEstado(abrir())).toEqual(antes);
  });

  it("um recorrente com várias vigências, inclusive encerrado ou reembolso, volta idêntico ao recarregar", () => {
    const estado = executarOk(
      abrir(),
      criarRecorrente({ data: "2026-01-31", valor: 150_000, tag: "casa" }),
      mudarRecorrente(1, "2026-03", { valor: 155_000, pote: "metas", tag: null }),
      mudarRecorrente(1, "2026-07", { valor: 165_000, tag: "#Moradia" }),
      criarRecorrente({ data: "2026-02-10", valor: -2_000 }),
      { tipo: "encerrar-recorrente", id: 2, mes: "2026-06" },
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-01", "2026-02", "2026-03", "2026-05", "2026-06", "2026-07", "2030-02"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
    expect(projetarMes(recarregado, "2028-02").ocorrencias.map((o) => [o.data, o.valor, o.tag])).toEqual([["2028-02-29", 165_000, "moradia"]]);
  });

  it("compras e recorrentes voltam na ordem em que foram lançados", () => {
    executarOk(
      abrir(),
      salvarLancamento({ data: "2026-09-12", pote: "conforto", valor: 1_000 }),
      criarRecorrente({ data: "2026-09-05" }),
      salvarLancamento({ data: "2026-09-13", pote: "conforto", valor: 2_000 }),
    );

    expect(carregarEstado(abrir()).lancamentos.map((l) => [l.id, l.forma])).toEqual([
      [1, "compra"],
      [2, "recorrente"],
      [3, "compra"],
    ]);
  });

  it("encerrar grava o fim e apaga do banco as vigências descartadas", () => {
    const banco = abrir();
    executarOk(
      banco,
      criarRecorrente({ data: "2026-01-05" }),
      mudarRecorrente(1, "2026-10", { valor: 11_000 }),
      mudarRecorrente(1, "2026-12", { valor: 12_000 }),
    );

    const depois = executarOk(banco, { tipo: "encerrar-recorrente", id: 1, mes: "2026-09" });

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(projetarMes(recarregado, "2026-12").ocorrencias).toEqual([]);
  });

  // As três gravações quebradas abaixo não saem de comando nenhum — o domínio
  // não produz descrição nula —, então entram pelo gravar de dentro.

  it("encerrar é gravado numa transação só: se uma linha falha, o fim e as vigências ficam como estavam", () => {
    const banco = abrir();
    const antes = executarOk(
      banco,
      criarRecorrente({ data: "2026-01-05" }),
      mudarRecorrente(1, "2026-05", { valor: 11_000 }),
      mudarRecorrente(1, "2026-10", { valor: 12_000 }),
    );
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
    executarOk(
      banco,
      salvarLancamento({ data: "2026-01-10", pote: "conforto", valor: 30_000, tag: "transporte" }),
      salvarLancamento({ data: "2026-02-05", pote: "conforto", valor: 120_000, parcelas: 12, tag: "uber" }),
      criarRecorrente({ data: "2026-01-15", tag: "transporte" }),
      mudarRecorrente(3, "2026-06", { valor: 28_000, tag: "uber" }),
    );

    // A fusão junta as duas: uma compra, um parcelado e as duas vigências passam a #uber.
    const depois = executarOk(banco, { tipo: "renomear-tag", de: "transporte", para: "uber", fundir: true });

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
    const antes = executarOk(
      banco,
      salvarLancamento({ data: "2026-01-10", pote: "conforto", valor: 30_000, tag: "transporte" }),
      criarRecorrente({ data: "2026-01-15", tag: "transporte" }),
    );
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

describe("executar no banco", () => {
  it("uma sequência aceita é gravada inteira, e devolve o estado que o banco recarrega", () => {
    const resultado = executarNoBanco(
      abrir(),
      [salvarEntrada({ data: "2026-09-05" }), salvarLancamento({ data: "2026-09-10", pote: "conforto", valor: 30_000 })],
      HOJE,
    );

    if (!resultado.ok) throw new Error(resultado.erro);
    expect(resultado.valor.entradas).toHaveLength(1);
    expect(resultado.valor.lancamentos).toHaveLength(1);
    expect(carregarEstado(abrir())).toEqual(resultado.valor);
  });

  it("um comando recusado devolve o texto do domínio e o seu índice, e deixa o banco como estava", () => {
    const banco = abrir();
    const antes = executarOk(banco, salvarEntrada({ data: "2026-09-05" }));

    const resultado = executarNoBanco(
      banco,
      [
        salvarLancamento({ data: "2026-09-10", pote: "conforto", valor: 30_000 }),
        salvarEntrada({ data: "2026-09-20" }),
        { tipo: "apagar", registro: "lancamento", id: 99 },
      ],
      HOJE,
    );

    expect(resultado).toEqual({ ok: false, erro: "Esse lançamento não existe mais.", indice: 2 });
    // Nem o lançamento nem a segunda entrada, aceitos antes da recusa, ficaram.
    expect(carregarEstado(abrir())).toEqual(antes);
  });
});

function salvarEntrada(campos: { id?: number; data: `${number}-${number}-${number}`; valor?: number }): Comando {
  return {
    tipo: "salvar-entrada",
    entrada: { descricao: "Salário", fonte: "salario", tipo: "transferencia", valor: 720_000, ...campos },
  };
}

function salvarPercentuais(mes: Mes, percentuais: Percentuais): Comando {
  return { tipo: "salvar-percentuais", mes, percentuais };
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

/** Grava um estado qualquer numa transação só, como o executarNoBanco faria com o que o domínio devolve. */
function gravarEstado({ db }: Banco, estado: Estado): void {
  db.transaction((tx) => gravar(tx, estado));
}

/** Executa no banco comandos que o domínio aceita, e devolve o estado gravado. */
function executarOk(banco: Banco, ...comandos: Comando[]): Estado {
  const resultado = executarNoBanco(banco, comandos, HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}

function aplicarOk(estado: Estado, comando: Comando): Estado {
  const resultado = aplicar(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentuais {
  return Object.fromEntries(POTES.map((p, i) => [p.id, valores[i]])) as Percentuais;
}
