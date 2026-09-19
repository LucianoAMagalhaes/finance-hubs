import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  POTES,
  projetarMes,
  type Comando,
  type Data,
  type Estado,
  type LancamentoASalvar,
  type NovoLancamento,
  type Percentuais,
  type VistaDoMes,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

/** Setembro nascido com os padrão e R$ 10.000,00 de receita: Conforto tem limite de R$ 1.500,00. */
function comReceita(valor = 1_000_000): Estado {
  return {
    ...estadoVazio(),
    orcamentos: { "2026-09": pcts(30, 25, 15, 15, 10, 5) },
    entradas: [{ id: 1, data: "2026-09-05", descricao: "Salário", fonte: "salario", tipo: "transferencia", valor, apagadoEm: null }],
  };
}

describe("lançamento à vista", () => {
  it("o gasto entra no total do pote, e só do seu pote", () => {
    const estado = salvar(comReceita(), aVista({ pote: "conforto", valor: 42_000 }));

    const vista = projetarMes(estado, "2026-09");

    expect(poteDe(vista, "conforto").total).toBe(42_000);
    expect(vista.potes.filter((p) => p.id !== "conforto").every((p) => p.total === 0)).toBe(true);
  });

  it("o gasto pesa só no mês da sua data", () => {
    const estado = salvar(comReceita(), aVista({ data: "2026-10-02", pote: "conforto", valor: 42_000 }));

    expect(poteDe(projetarMes(estado, "2026-09"), "conforto").total).toBe(0);
    expect(poteDe(projetarMes(estado, "2026-10"), "conforto").total).toBe(42_000);
  });

  it("o à vista é uma compra de uma parcela: uma ocorrência no mês, com o total", () => {
    const estado = salvar(comReceita(), aVista({ descricao: "Jantar", pote: "prazeres", tipo: "pix", valor: 18_990 }));

    const vista = projetarMes(estado, "2026-09");

    expect(vista.ocorrencias).toEqual([
      { lancamento: 1, data: "2026-09-12", descricao: "Jantar", pote: "prazeres", tipo: "pix", tag: null, valor: 18_990, parcela: null },
    ]);
    expect(estado.lancamentos[0]).toMatchObject({ valor: 18_990, parcelas: 1 });
  });

  it("as ocorrências do mês vêm em ordem de data", () => {
    let estado = salvar(comReceita(), aVista({ data: "2026-09-20", descricao: "Farmácia" }));
    estado = salvar(estado, aVista({ data: "2026-09-03", descricao: "Mercado" }));
    estado = salvar(estado, aVista({ data: "2026-10-01", descricao: "Outubro" }));

    expect(projetarMes(estado, "2026-09").ocorrencias.map((o) => o.descricao)).toEqual(["Mercado", "Farmácia"]);
  });

  it("editar o gasto troca o total do pote, e mudá-lo de pote leva o total junto", () => {
    const estado = salvar(comReceita(), aVista({ pote: "conforto", valor: 42_000 }));
    const id = estado.lancamentos[0]!.id;

    const editado = salvar(estado, { ...aVista({ pote: "metas", valor: 50_000 }), id });

    const vista = projetarMes(editado, "2026-09");
    expect(poteDe(vista, "conforto").total).toBe(0);
    expect(poteDe(vista, "metas").total).toBe(50_000);
    expect(vista.ocorrencias).toHaveLength(1);
  });

  it("editar um lançamento que não existe é recusado", () => {
    const resultado = aplicar(comReceita(), salvarLancamento({ ...aVista({}), id: 42 }), HOJE);

    expect(resultado).toEqual({ ok: false, erro: expect.stringMatching(/não existe/) });
  });
});

describe("veredito", () => {
  // 15% de R$ 3,33 = 49,95 centavos: o limite exato tem fração de centavo.
  it("um centavo acima do limite exato é Estourou, com o estouro exato", () => {
    const estado = salvar(comReceita(333), aVista({ pote: "conforto", valor: 50 }));

    const conforto = poteDe(projetarMes(estado, "2026-09"), "conforto");

    expect(conforto.veredito).toBe("estourou");
    expect(conforto.estouro).toBeCloseTo(0.05, 10);
  });

  it("exatamente no limite é Sobra", () => {
    const estado = salvar(comReceita(), aVista({ pote: "conforto", valor: 150_000 }));

    const conforto = poteDe(projetarMes(estado, "2026-09"), "conforto");

    expect(conforto.veredito).toBe("sobra");
    expect(conforto.estouro).toBe(0);
  });

  it("um centavo acima do limite é Estourou por um centavo", () => {
    const estado = salvar(comReceita(), aVista({ pote: "conforto", valor: 150_001 }));

    const conforto = poteDe(projetarMes(estado, "2026-09"), "conforto");

    expect(conforto.veredito).toBe("estourou");
    expect(conforto.estouro).toBe(1);
  });

  it("mês sem entrada é Sem receita, mesmo com gasto", () => {
    const estado = salvar(estadoVazio(), aVista({ pote: "conforto", valor: 42_000 }));

    const conforto = poteDe(projetarMes(estado, "2026-09"), "conforto");

    expect(conforto).toMatchObject({ total: 42_000, limite: null, veredito: "sem-receita", estouro: null });
  });
});

describe("reembolso", () => {
  it("reduz o total do pote e as Despesas, sem mexer na receita nem nos limites", () => {
    const comGasto = salvar(comReceita(), aVista({ pote: "conforto", valor: 80_000 }));
    const antes = projetarMes(comGasto, "2026-09");

    const depois = projetarMes(salvar(comGasto, aVista({ pote: "conforto", valor: -29_790 })), "2026-09");

    expect(poteDe(depois, "conforto").total).toBe(50_210);
    expect(depois.agregados.despesas).toBe(50_210);
    expect(depois.receita).toBe(antes.receita);
    expect(depois.potes.map((p) => p.limite)).toEqual(antes.potes.map((p) => p.limite));
  });

  it("pode deixar o total do pote negativo", () => {
    const estado = salvar(comReceita(), aVista({ pote: "conforto", valor: -29_790 }));

    const conforto = poteDe(projetarMes(estado, "2026-09"), "conforto");

    expect(conforto.total).toBe(-29_790);
    expect(conforto.veredito).toBe("sobra");
  });

  it("tira um pote do estouro", () => {
    let estado = salvar(comReceita(), aVista({ pote: "conforto", valor: 160_000 }));
    estado = salvar(estado, aVista({ pote: "conforto", valor: -10_000 }));

    expect(poteDe(projetarMes(estado, "2026-09"), "conforto").veredito).toBe("sobra");
  });
});

describe("agregados do mês", () => {
  it("Despesas é a soma dos seis potes, e Saldo do mês é Receitas − Despesas", () => {
    let estado = salvar(comReceita(), aVista({ pote: "custos-fixos", valor: 150_000 }));
    estado = salvar(estado, aVista({ pote: "conforto", valor: 42_000 }));
    estado = salvar(estado, aVista({ pote: "prazeres", valor: 18_990 }));
    estado = salvar(estado, aVista({ pote: "conforto", valor: -5_000 }));
    estado = salvar(estado, aVista({ data: "2026-10-01", pote: "metas", valor: 99_999 }));

    const vista = projetarMes(estado, "2026-09");

    const somaDosPotes = vista.potes.reduce((s, p) => s + p.total, 0);
    expect(vista.agregados.despesas).toBe(205_990);
    expect(vista.agregados.despesas).toBe(somaDosPotes);
    expect(vista.agregados.saldoDoMes).toBe(1_000_000 - 205_990);
  });

  it("Saldo em conta ignora as ocorrências no Cartão de Crédito", () => {
    let estado = salvar(comReceita(), aVista({ tipo: "cartao-de-credito", valor: 300_000 }));
    estado = salvar(estado, aVista({ tipo: "pix", valor: 50_000 }));
    estado = salvar(estado, aVista({ tipo: "cartao-de-debito", valor: 20_000 }));
    estado = salvar(estado, aVista({ tipo: "cartao-de-credito", valor: -10_000 }));

    const { agregados } = projetarMes(estado, "2026-09");

    expect(agregados.despesas).toBe(360_000);
    expect(agregados.saldoEmConta).toBe(1_000_000 - 70_000);
  });

  it("gastar mais do que entrou deixa o saldo negativo", () => {
    const estado = salvar(comReceita(100_000), aVista({ valor: 150_000 }));

    expect(projetarMes(estado, "2026-09").agregados.saldoDoMes).toBe(-50_000);
  });
});

describe("validação do lançamento", () => {
  it.each(["dinheiro", "cartao-de-credito", "cartao-de-debito", "pix", "transferencia", "boleto", "debito-automatico"] as const)(
    "tipo de pagamento %s é aceito",
    (tipo) => {
      expect(aplicar(estadoVazio(), salvarLancamento(aVista({ tipo })), HOJE).ok).toBe(true);
    },
  );

  it.each([
    ["valor zero", { valor: 0 }],
    ["valor com fração de centavo", { valor: 100.5 }],
    ["valor que não é número", { valor: "100" as never }],
    ["descrição em branco", { descricao: "   " }],
    ["descrição ausente, num comando malformado", { descricao: undefined as never }],
    ["pote fora da lista", { pote: "viagens" as never }],
    ["tipo de pagamento fora da lista", { tipo: "cheque" as never }],
    ["data que não existe", { data: "2026-02-30" as Data }],
    ["data malformada", { data: "12/09/2026" as Data }],
  ])("%s é recusado", (_, campos) => {
    expect(aplicar(estadoVazio(), salvarLancamento(aVista(campos)), HOJE).ok).toBe(false);
  });

  it("a descrição é gravada sem os espaços das pontas", () => {
    const estado = salvar(estadoVazio(), aVista({ descricao: "  Mercado  " }));

    expect(estado.lancamentos[0]!.descricao).toBe("Mercado");
  });
});

describe("nascimento do mês ao salvar um lançamento", () => {
  it("o mês da data do gasto nasce com os percentuais que herdaria", () => {
    const estado: Estado = { ...estadoVazio(), orcamentos: { "2026-08": pcts(40, 20, 10, 10, 10, 10) } };

    const salvo = salvar(estado, aVista({ data: "2026-09-12" }));

    const vista = projetarMes(salvo, "2026-09");
    expect(vista.orcamento).toEqual({ nascido: true, herdadoDe: null });
    expect(vista.potes.map((p) => p.percentual)).toEqual([40, 20, 10, 10, 10, 10]);
  });

  it("um comando recusado não muda o estado nem faz mês nascer", () => {
    const estado = estadoVazio();

    aplicar(estado, salvarLancamento(aVista({ valor: 0 })), HOJE);

    expect(estado).toEqual(estadoVazio());
  });
});

function aVista(campos: Partial<NovoLancamento>): LancamentoASalvar {
  return {
    data: "2026-09-12",
    descricao: "Mercado",
    pote: "custos-fixos",
    tipo: "cartao-de-debito",
    valor: 10_000,
    parcelas: 1,
    ...campos,
  };
}

function salvarLancamento(lancamento: LancamentoASalvar): Comando {
  return { tipo: "salvar-lancamento", lancamento };
}

function salvar(estado: Estado, lancamento: LancamentoASalvar): Estado {
  const resultado = aplicar(estado, salvarLancamento(lancamento), HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}

function poteDe(vista: VistaDoMes, id: string) {
  return vista.potes.find((p) => p.id === id)!;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentuais {
  return Object.fromEntries(POTES.map((p, i) => [p.id, valores[i]])) as Percentuais;
}
