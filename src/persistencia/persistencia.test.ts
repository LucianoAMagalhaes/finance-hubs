import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  JARS,
  projectMonth,
  tagsInUse,
  type Command,
  type Purchase,
  type State,
  type Month,
  type Percentages,
  type Jar,
  type Recurring,
  type PeriodToSave,
} from "@/domain";
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
    expect(carregarEstado(abrir())).toEqual(emptyState());
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
      expect(projectMonth(recarregado, mes)).toEqual(projectMonth(estado, mes));
    }
  });

  it("salvar de novo um mês que já existe troca os seus percentuais", () => {
    const banco = abrir();
    executarOk(banco, salvarPercentuais("2026-09", pcts(30, 25, 15, 15, 10, 5)));

    executarOk(banco, salvarPercentuais("2026-09", pcts(40, 20, 15, 15, 10, 0)));

    expect(carregarEstado(abrir()).budgets["2026-09"]).toEqual(pcts(40, 20, 15, 15, 10, 0));
  });

  it("uma entrada gravada volta idêntica ao recarregar, com o mês que ela fez nascer", () => {
    const estado = executarOk(abrir(), salvarEntrada({ date: "2026-09-05", amount: 720_050 }));

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    expect(projectMonth(recarregado, "2026-09")).toEqual(projectMonth(estado, "2026-09"));
    expect(projectMonth(recarregado, "2026-09").budget.born).toBe(true);
  });

  it("corrigir a data de uma entrada grava a mudança e o mês de destino", () => {
    const banco = abrir();
    const antes = executarOk(banco, salvarEntrada({ date: "2026-10-05" }));
    const id = antes.incomes[0]!.id;

    const depois = executarOk(banco, salvarEntrada({ id, date: "2026-09-30" }));

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(projectMonth(recarregado, "2026-09").monthIncome).toBe(720_000);
    expect(projectMonth(recarregado, "2026-10").monthIncome).toBe(0);
  });

  it("percentuais salvos por comando voltam idênticos, sem mexer nos outros meses", () => {
    const banco = abrir();
    executarOk(banco, salvarEntrada({ date: "2026-09-05" }));

    const depois = executarOk(banco, salvarPercentuais("2026-10", pcts(40, 20, 15, 10, 5, 0)));

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(recarregado.budgets["2026-10"]).toEqual(pcts(40, 20, 15, 10, 5, 0));
    expect(recarregado.budgets["2026-09"]).toEqual(pcts(30, 25, 15, 15, 10, 5));
  });

  it("um lançamento à vista, inclusive negativo, volta idêntico ao recarregar", () => {
    const estado = executarOk(
      abrir(),
      salvarEntrada({ date: "2026-09-05" }),
      salvarLancamento({ date: "2026-09-12", jar: "conforto", amount: 42_050 }),
      salvarLancamento({ date: "2026-09-19", jar: "conforto", amount: -29_790 }),
      salvarLancamento({ date: "2026-10-02", jar: "metas", amount: 10_000 }),
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-09", "2026-10"] as const) {
      expect(projectMonth(recarregado, mes)).toEqual(projectMonth(estado, mes));
    }
    expect(recarregado.budgets["2026-10"]).toBeDefined();
  });

  it("um parcelado, inclusive reembolso parcelado, volta idêntico ao recarregar", () => {
    const estado = executarOk(
      abrir(),
      salvarLancamento({ date: "2026-08-31", jar: "conforto", amount: 389_900, installments: 10 }),
      salvarLancamento({ date: "2026-09-10", jar: "conforto", amount: -100_000, installments: 3 }),
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-08", "2026-09", "2026-11", "2027-05", "2027-06"] as const) {
      expect(projectMonth(recarregado, mes)).toEqual(projectMonth(estado, mes));
    }
    // Em ordem de data: o reembolso cai no dia 10; a compra do dia 31, no último dia de novembro.
    expect(projectMonth(recarregado, "2026-11").occurrences.map((o) => [o.date, o.installment])).toEqual([
      ["2026-11-10", { number: 3, of: 3, total: -100_000 }],
      ["2026-11-30", { number: 4, of: 10, total: 389_900 }],
    ]);
  });

  it("corrigir um lançamento grava a mudança", () => {
    const banco = abrir();
    const antes = executarOk(banco, salvarLancamento({ date: "2026-09-12", jar: "conforto", amount: 42_050 }));
    const id = antes.expenses[0]!.id;

    const depois = executarOk(banco, salvarLancamento({ id, date: "2026-09-12", jar: "metas", amount: -500 }));

    expect(carregarEstado(abrir())).toEqual(depois);
  });

  it("a tag gravada volta normalizada, e sem tag volta sem tag", () => {
    const estado = executarOk(
      abrir(),
      salvarLancamento({ date: "2026-09-12", jar: "conforto", amount: 4_000, tag: "#Saúde Mental" }),
      salvarLancamento({ date: "2026-09-13", jar: "conforto", amount: 2_000 }),
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado.expenses.map((l) => (l as Purchase).tag)).toEqual(["saúde-mental", null]);
    expect(recarregado).toEqual(estado);
    expect(projectMonth(recarregado, "2026-09")).toEqual(projectMonth(estado, "2026-09"));
  });

  it("a marca de lixeira sobrevive a recarregar, e restaurar a tira do banco", () => {
    const banco = abrir();
    const apagado = executarOk(
      banco,
      salvarEntrada({ date: "2026-09-05" }),
      salvarLancamento({ date: "2026-09-12", jar: "conforto", amount: 100_000, installments: 3 }),
      { type: "delete", record: "income", id: 1 },
      { type: "delete", record: "expense", id: 1 },
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(apagado);
    expect(recarregado.incomes[0]!.deletedAt).toBe(HOJE);
    expect(recarregado.expenses[0]!.deletedAt).toBe(HOJE);
    for (const mes of ["2026-09", "2026-10", "2026-11"] as const) {
      expect(projectMonth(recarregado, mes)).toEqual(projectMonth(apagado, mes));
      expect(projectMonth(recarregado, mes).occurrences).toEqual([]);
    }
    expect(projectMonth(recarregado, "2026-09").monthIncome).toBe(0);
    expect(recarregado.budgets["2026-09"]).toBeDefined();

    const restaurado = executarOk(banco, { type: "restore", record: "expense", id: 1 });

    expect(carregarEstado(abrir())).toEqual(restaurado);
    expect(carregarEstado(abrir()).expenses[0]!.deletedAt).toBeNull();
  });

  it("as antecipações de um parcelado voltam idênticas ao recarregar, com a série já cortada", () => {
    const estado = executarOk(
      abrir(),
      salvarLancamento({ date: "2026-01-15", jar: "conforto", amount: 389_900, installments: 10 }),
      antecipar({ date: "2026-07-20", installments: 1, amount: 36_000 }),
      antecipar({ date: "2026-08-10", installments: 1, amount: 35_000 }),
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    expect((recarregado.expenses[0] as Purchase).prepayments).toEqual([
      { id: 1, date: "2026-07-20", installments: 1, amount: 36_000, deletedAt: null },
      { id: 2, date: "2026-08-10", installments: 1, amount: 35_000, deletedAt: null },
    ]);
    for (const mes of ["2026-07", "2026-08", "2026-09", "2026-10"] as const) {
      expect(projectMonth(recarregado, mes), mes).toEqual(projectMonth(estado, mes));
    }
    expect(projectMonth(recarregado, "2026-09").occurrences).toEqual([]);
  });

  it("corrigir uma antecipação não muda o lugar dela: o estado gravado volta idêntico", () => {
    const banco = abrir();
    executarOk(
      banco,
      salvarLancamento({ date: "2026-01-15", jar: "conforto", amount: 389_900, installments: 10 }),
      antecipar({ date: "2026-07-20", installments: 1, amount: 36_000 }),
      antecipar({ date: "2026-08-10", installments: 1, amount: 35_000 }),
    );

    const depois = executarOk(banco, antecipar({ id: 1, date: "2026-07-20", installments: 1, amount: 30_000 }));

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect((recarregado.expenses[0] as Purchase).prepayments.map((a) => [a.id, a.amount])).toEqual([
      [1, 30_000],
      [2, 35_000],
    ]);
  });

  it("uma antecipação desfeita volta da lixeira pelo banco, e as parcelas voltam com ela", () => {
    const banco = abrir();
    const antes = executarOk(
      banco,
      salvarLancamento({ date: "2026-01-15", jar: "conforto", amount: 389_900, installments: 10 }),
      antecipar({ date: "2026-07-20", installments: 3, amount: 300_000 }),
    );
    const desfeita = executarOk(banco, { type: "delete", record: "prepayment", id: 1 });

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(desfeita);
    expect((recarregado.expenses[0] as Purchase).prepayments[0]!.deletedAt).toBe(HOJE);
    expect(projectMonth(recarregado, "2026-10").occurrences).toHaveLength(1);

    executarOk(banco, { type: "restore", record: "prepayment", id: 1 });

    expect(carregarEstado(abrir())).toEqual(antes);
  });

  it("um recorrente com várias vigências, inclusive encerrado ou reembolso, volta idêntico ao recarregar", () => {
    const estado = executarOk(
      abrir(),
      criarRecorrente({ date: "2026-01-31", amount: 150_000, tag: "casa" }),
      mudarRecorrente(1, "2026-03", { amount: 155_000, jar: "metas", tag: null }),
      mudarRecorrente(1, "2026-07", { amount: 165_000, tag: "#Moradia" }),
      criarRecorrente({ date: "2026-02-10", amount: -2_000 }),
      { type: "end-recurring", id: 2, month: "2026-06" },
    );

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-01", "2026-02", "2026-03", "2026-05", "2026-06", "2026-07", "2030-02"] as const) {
      expect(projectMonth(recarregado, mes)).toEqual(projectMonth(estado, mes));
    }
    expect(projectMonth(recarregado, "2028-02").occurrences.map((o) => [o.date, o.amount, o.tag])).toEqual([["2028-02-29", 165_000, "moradia"]]);
  });

  it("compras e recorrentes voltam na ordem em que foram lançados", () => {
    executarOk(
      abrir(),
      salvarLancamento({ date: "2026-09-12", jar: "conforto", amount: 1_000 }),
      criarRecorrente({ date: "2026-09-05" }),
      salvarLancamento({ date: "2026-09-13", jar: "conforto", amount: 2_000 }),
    );

    expect(carregarEstado(abrir()).expenses.map((l) => [l.id, l.kind])).toEqual([
      [1, "purchase"],
      [2, "recurring"],
      [3, "purchase"],
    ]);
  });

  it("encerrar grava o fim e apaga do banco as vigências descartadas", () => {
    const banco = abrir();
    executarOk(
      banco,
      criarRecorrente({ date: "2026-01-05" }),
      mudarRecorrente(1, "2026-10", { amount: 11_000 }),
      mudarRecorrente(1, "2026-12", { amount: 12_000 }),
    );

    const depois = executarOk(banco, { type: "end-recurring", id: 1, month: "2026-09" });

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(projectMonth(recarregado, "2026-12").occurrences).toEqual([]);
  });

  // As três gravações quebradas abaixo não saem de comando nenhum — o domínio
  // não produz descrição nula —, então entram pelo gravar de dentro.

  it("encerrar é gravado numa transação só: se uma linha falha, o fim e as vigências ficam como estavam", () => {
    const banco = abrir();
    const antes = executarOk(
      banco,
      criarRecorrente({ date: "2026-01-05" }),
      mudarRecorrente(1, "2026-05", { amount: 11_000 }),
      mudarRecorrente(1, "2026-10", { amount: 12_000 }),
    );
    const encerrado = aplicarOk(antes, { type: "end-recurring", id: 1, month: "2026-09" });
    // Uma vigência que o banco recusa (descrição nula), gravada depois do fim e da limpeza das descartadas.
    const r = encerrado.expenses[0] as Recurring;
    const quebrado: State = {
      ...encerrado,
      expenses: [{ ...r, periods: [r.periods[0]!, { ...r.periods[1]!, description: null as never }] }],
    };

    expect(() => gravarEstado(banco, quebrado)).toThrow();

    expect(carregarEstado(abrir())).toEqual(antes);
  });

  it("renomear uma tag grava o nome novo nas compras e nas vigências, em todos os meses", () => {
    const banco = abrir();
    executarOk(
      banco,
      salvarLancamento({ date: "2026-01-10", jar: "conforto", amount: 30_000, tag: "transporte" }),
      salvarLancamento({ date: "2026-02-05", jar: "conforto", amount: 120_000, installments: 12, tag: "uber" }),
      criarRecorrente({ date: "2026-01-15", tag: "transporte" }),
      mudarRecorrente(3, "2026-06", { amount: 28_000, tag: "uber" }),
    );

    // A fusão junta as duas: uma compra, um parcelado e as duas vigências passam a #uber.
    const depois = executarOk(banco, { type: "rename-tag", from: "transporte", to: "uber", merge: true });

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(depois);
    expect(recarregado.expenses.map((l) => (l.kind === "purchase" ? l.tag : l.periods.map((v) => v.tag)))).toEqual([
      "uber",
      "uber",
      ["uber", "uber"],
    ]);
    for (const mes of ["2026-01", "2026-02", "2026-06", "2027-01"] as const) {
      expect(projectMonth(recarregado, mes), mes).toEqual(projectMonth(depois, mes));
    }
  });

  it("renomear é gravado numa transação só: se uma linha falha, nenhum lançamento troca de tag", () => {
    const banco = abrir();
    const antes = executarOk(
      banco,
      salvarLancamento({ date: "2026-01-10", jar: "conforto", amount: 30_000, tag: "transporte" }),
      criarRecorrente({ date: "2026-01-15", tag: "transporte" }),
    );
    const renomeado = aplicarOk(antes, { type: "rename-tag", from: "transporte", to: "mobilidade", merge: false });
    // Uma vigência que o banco recusa (descrição nula), gravada depois da compra já renomeada.
    const r = renomeado.expenses[1] as Recurring;
    const quebrado: State = {
      ...renomeado,
      expenses: [renomeado.expenses[0]!, { ...r, periods: [{ ...r.periods[0]!, description: null as never }] }],
    };

    expect(() => gravarEstado(banco, quebrado)).toThrow();

    const recarregado = carregarEstado(abrir());
    expect(recarregado).toEqual(antes);
    // A compra é gravada antes do recorrente: sem a transação, ela teria ficado com o nome novo.
    expect((recarregado.expenses[0] as Purchase).tag).toBe("transporte");
    expect(tagsInUse(recarregado)).toEqual(["transporte"]);
  });

  it("o orçamento nascido e a entrada entram na mesma transação: ou os dois, ou nenhum", () => {
    const estado = aplicarOk(emptyState(), salvarEntrada({ date: "2026-09-05" }));
    // Uma entrada que o banco recusa (descrição nula), gravada depois do orçamento.
    const quebrado: State = { ...estado, incomes: [{ ...estado.incomes[0]!, description: null as never }] };

    expect(() => gravarEstado(abrir(), quebrado)).toThrow();

    expect(carregarEstado(abrir())).toEqual(emptyState());
  });
});

describe("executar no banco", () => {
  it("uma sequência aceita é gravada inteira, e devolve o estado que o banco recarrega", () => {
    const resultado = executarNoBanco(
      abrir(),
      [salvarEntrada({ date: "2026-09-05" }), salvarLancamento({ date: "2026-09-10", jar: "conforto", amount: 30_000 })],
      HOJE,
    );

    if (!resultado.ok) throw new Error(resultado.error);
    expect(resultado.value.incomes).toHaveLength(1);
    expect(resultado.value.expenses).toHaveLength(1);
    expect(carregarEstado(abrir())).toEqual(resultado.value);
  });

  it("um comando recusado devolve o texto do domínio e o seu índice, e deixa o banco como estava", () => {
    const banco = abrir();
    const antes = executarOk(banco, salvarEntrada({ date: "2026-09-05" }));

    const resultado = executarNoBanco(
      banco,
      [
        salvarLancamento({ date: "2026-09-10", jar: "conforto", amount: 30_000 }),
        salvarEntrada({ date: "2026-09-20" }),
        { type: "delete", record: "expense", id: 99 },
      ],
      HOJE,
    );

    expect(resultado).toEqual({ ok: false, error: "Esse lançamento não existe mais.", indice: 2 });
    // Nem o lançamento nem a segunda entrada, aceitos antes da recusa, ficaram.
    expect(carregarEstado(abrir())).toEqual(antes);
  });
});

function salvarEntrada(campos: { id?: number; date: `${number}-${number}-${number}`; amount?: number }): Command {
  return {
    type: "save-income",
    income: { description: "Salário", source: "salario", paymentMethod: "transferencia", amount: 720_000, ...campos },
  };
}

function salvarPercentuais(mes: Month, percentuais: Percentages): Command {
  return { type: "save-percentages", month: mes, percentages: percentuais };
}

function antecipar(campos: { id?: number; date: `${number}-${number}-${number}`; installments: number; amount: number }): Command {
  return { type: "save-prepayment", prepayment: { expense: 1, ...campos } };
}

function salvarLancamento(campos: {
  id?: number;
  date: `${number}-${number}-${number}`;
  jar: Jar;
  amount: number;
  installments?: number;
  tag?: string;
}): Command {
  return {
    type: "save-expense",
    expense: { description: "Restaurante", paymentMethod: "cartao-de-credito", installments: 1, ...campos },
  };
}

function criarRecorrente(campos: Partial<PeriodToSave> & { date: `${number}-${number}-${number}` }): Command {
  return {
    type: "create-recurring",
    recurring: { description: "Aluguel", jar: "custos-fixos", paymentMethod: "boleto", amount: 10_000, ...campos },
  };
}

function mudarRecorrente(id: number, mes: Month, campos: Partial<PeriodToSave>): Command {
  return {
    type: "change-recurring",
    id,
    month: mes,
    period: { description: "Aluguel", jar: "custos-fixos", paymentMethod: "boleto", amount: 10_000, ...campos },
  };
}

/** Grava um estado qualquer numa transação só, como o executarNoBanco faria com o que o domínio devolve. */
function gravarEstado({ db }: Banco, estado: State): void {
  db.transaction((tx) => gravar(tx, estado));
}

/** Executa no banco comandos que o domínio aceita, e devolve o estado gravado. */
function executarOk(banco: Banco, ...comandos: Command[]): State {
  const resultado = executarNoBanco(banco, comandos, HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}

function aplicarOk(estado: State, comando: Command): State {
  const resultado = apply(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentages {
  return Object.fromEntries(JARS.map((p, i) => [p.id, valores[i]])) as Percentages;
}
