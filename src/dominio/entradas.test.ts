import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  POTES,
  projetarMes,
  type Comando,
  type Data,
  type EntradaASalvar,
  type Estado,
  type NovaEntrada,
  type Percentuais,
  type VistaDoMes,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

describe("entradas e receita do mês", () => {
  it("uma entrada faz a receita do mês existir, e com ela os seis limites", () => {
    const estado = salvar(estadoVazio(), entrada({ data: "2026-09-05", valor: 1_000_000 }));

    const vista = projetarMes(estado, "2026-09");

    expect(vista.receita).toBe(1_000_000);
    expect(vista.agregados.receitas).toBe(1_000_000);
    expect(vista.potes.map((p) => p.limite)).toEqual([300_000, 250_000, 150_000, 150_000, 100_000, 50_000]);
    expect(vista.potes.map((p) => p.veredito)).toEqual(Array(6).fill("sobra"));
  });

  it("a receita é a soma das entradas do mês, e só delas", () => {
    let estado = salvar(estadoVazio(), entrada({ data: "2026-09-05", valor: 720_000 }));
    estado = salvar(estado, entrada({ data: "2026-09-20", valor: 90_000, fonte: "freela", tipo: "pix" }));
    estado = salvar(estado, entrada({ data: "2026-10-05", valor: 500_000 }));

    expect(projetarMes(estado, "2026-09").receita).toBe(810_000);
    expect(projetarMes(estado, "2026-10").receita).toBe(500_000);
    expect(projetarMes(estado, "2026-08").receita).toBe(0);
  });

  it("o limite é exato: a fração de centavo não é arredondada", () => {
    const estado = salvar(estadoVazio(), entrada({ data: "2026-09-05", valor: 333 }));

    // 5% de R$ 3,33 = 16,65 centavos
    expect(poteDe(projetarMes(estado, "2026-09"), "prazeres").limite).toBeCloseTo(16.65, 10);
  });

  it("o não alocado aparece em reais quando há receita", () => {
    let estado: Estado = { ...estadoVazio(), orcamentos: { "2026-09": pcts(30, 20, 15, 15, 5, 5) } };
    estado = salvar(estado, entrada({ data: "2026-09-05", valor: 500_000 }));

    expect(projetarMes(estado, "2026-09").naoAlocado).toEqual({ percentual: 10, valor: 50_000 });
    expect(projetarMes(estadoVazio(), "2026-09").naoAlocado).toEqual({ percentual: 0, valor: null });
  });

  it("a vista traz as entradas do mês em ordem de data", () => {
    let estado = salvar(estadoVazio(), entrada({ data: "2026-09-20", descricao: "Freela", fonte: "freela" }));
    estado = salvar(estado, entrada({ data: "2026-09-05", descricao: "Salário" }));
    estado = salvar(estado, entrada({ data: "2026-10-05", descricao: "Salário outubro" }));

    expect(projetarMes(estado, "2026-09").entradas.map((e) => [e.data, e.descricao, e.fonte])).toEqual([
      ["2026-09-05", "Salário", "salario"],
      ["2026-09-20", "Freela", "freela"],
    ]);
  });

  it("editar uma entrada troca o valor e move a receita junto", () => {
    const estado = salvar(estadoVazio(), entrada({ data: "2026-09-05", valor: 720_000 }));
    const id = projetarMes(estado, "2026-09").entradas[0]!.id;

    const editado = salvar(estado, { ...entrada({ data: "2026-09-05", valor: 750_000 }), id });

    expect(projetarMes(editado, "2026-09").receita).toBe(750_000);
    expect(projetarMes(editado, "2026-09").entradas).toHaveLength(1);
  });

  it("mudar a data para outro mês leva a receita junto e faz o mês de destino nascer", () => {
    const estado = salvar(estadoVazio(), entrada({ data: "2026-10-05", valor: 720_000 }));
    const id = projetarMes(estado, "2026-10").entradas[0]!.id;

    const movido = salvar(estado, { ...entrada({ data: "2026-09-30", valor: 720_000 }), id });

    const outubro = projetarMes(movido, "2026-10");
    const setembro = projetarMes(movido, "2026-09");
    expect(outubro.receita).toBe(0);
    expect(outubro.potes.every((p) => p.limite === null && p.veredito === "sem-receita")).toBe(true);
    expect(outubro.orcamento.nascido).toBe(true);
    expect(setembro.receita).toBe(720_000);
    expect(setembro.orcamento.nascido).toBe(true);
  });

  it("editar uma entrada que não existe é recusado", () => {
    const resultado = aplicar(estadoVazio(), salvarEntrada({ ...entrada({}), id: 42 }), HOJE);

    expect(resultado).toEqual({ ok: false, erro: expect.stringMatching(/não existe/) });
  });
});

describe("validação da entrada", () => {
  it.each(["cartao-de-credito", "cartao-de-debito", "boleto", "debito-automatico"] as const)(
    "tipo de pagamento %s é recusado: entrada só em Dinheiro, PIX ou Transferência",
    (tipo) => {
      // O tipo não deixa, mas o comando chega do navegador: o domínio confere de novo.
      const resultado = aplicar(estadoVazio(), salvarEntrada(entrada({ tipo: tipo as never })), HOJE);

      expect(resultado.ok).toBe(false);
    },
  );

  it.each(["dinheiro", "pix", "transferencia"] as const)("tipo de pagamento %s é aceito", (tipo) => {
    expect(aplicar(estadoVazio(), salvarEntrada(entrada({ tipo })), HOJE).ok).toBe(true);
  });

  it.each([
    ["valor zero", { valor: 0 }],
    ["valor negativo", { valor: -10_000 }],
    ["valor com fração de centavo", { valor: 100.5 }],
    ["descrição em branco", { descricao: "   " }],
    ["descrição ausente, num comando malformado", { descricao: undefined as never }],
    ["fonte fora da lista", { fonte: "herança" as never }],
    ["data que não existe", { data: "2026-02-30" as Data }],
    ["data malformada", { data: "30/09/2026" as Data }],
  ])("%s é recusado", (_, campos) => {
    const resultado = aplicar(estadoVazio(), salvarEntrada(entrada(campos)), HOJE);

    expect(resultado.ok).toBe(false);
  });

  it("um comando recusado não muda o estado nem faz mês nascer", () => {
    const estado = estadoVazio();

    aplicar(estado, salvarEntrada(entrada({ valor: 0 })), HOJE);

    expect(projetarMes(estado, "2026-09").orcamento.nascido).toBe(false);
  });

  it("a descrição é gravada sem os espaços das pontas", () => {
    const estado = salvar(estadoVazio(), entrada({ data: "2026-09-05", descricao: "  Salário  " }));

    expect(projetarMes(estado, "2026-09").entradas[0]!.descricao).toBe("Salário");
  });
});

describe("nascimento do mês ao salvar uma entrada", () => {
  it("o mês da entrada nasce com os percentuais que herdaria", () => {
    const estado: Estado = { ...estadoVazio(), orcamentos: { "2026-08": pcts(40, 20, 10, 10, 10, 10) } };

    const salvo = salvar(estado, entrada({ data: "2026-09-05" }));

    const vista = projetarMes(salvo, "2026-09");
    expect(vista.orcamento).toEqual({ nascido: true, herdadoDe: null });
    expect(vista.potes.map((p) => p.percentual)).toEqual([40, 20, 10, 10, 10, 10]);
  });

  it("salário de março lançado com setembro já nascido faz março nascer com os padrão", () => {
    let estado = salvar(estadoVazio(), entrada({ data: "2026-09-05" }));
    estado = { ...estado, orcamentos: { ...estado.orcamentos, "2026-09": pcts(50, 10, 10, 10, 10, 10) } };

    const salvo = salvar(estado, entrada({ data: "2026-03-05" }));

    const marco = projetarMes(salvo, "2026-03");
    expect(marco.orcamento.nascido).toBe(true);
    expect(marco.potes.map((p) => p.percentual)).toEqual([30, 25, 15, 15, 10, 5]);
  });

  it("caso intercalado: dezembro herda de outubro mesmo com janeiro já nascido de setembro", () => {
    let estado: Estado = { ...estadoVazio(), orcamentos: { "2026-09": pcts(50, 10, 10, 10, 10, 10) } };
    estado = salvar(estado, entrada({ data: "2027-01-05" }));
    estado = { ...estado, orcamentos: { ...estado.orcamentos, "2026-10": pcts(20, 20, 20, 20, 10, 10) } };

    const salvo = salvar(estado, entrada({ data: "2026-12-05" }));

    expect(projetarMes(salvo, "2027-01").potes.map((p) => p.percentual)).toEqual([50, 10, 10, 10, 10, 10]);
    expect(projetarMes(salvo, "2026-12").potes.map((p) => p.percentual)).toEqual([20, 20, 20, 20, 10, 10]);
  });

  it("um mês que já nasceu não tem os percentuais trocados por uma entrada nova", () => {
    let estado: Estado = {
      ...estadoVazio(),
      orcamentos: { "2026-08": pcts(40, 20, 10, 10, 10, 10), "2026-09": pcts(30, 30, 10, 10, 10, 10) },
    };

    estado = salvar(estado, entrada({ data: "2026-09-05" }));

    expect(projetarMes(estado, "2026-09").potes.map((p) => p.percentual)).toEqual([30, 30, 10, 10, 10, 10]);
  });

  it("aplicar não muda o estado recebido", () => {
    const estado = estadoVazio();

    salvar(estado, entrada({ data: "2026-09-05" }));

    expect(estado).toEqual(estadoVazio());
  });
});

function entrada(campos: Partial<NovaEntrada>): NovaEntrada {
  return {
    data: "2026-09-05",
    descricao: "Salário",
    fonte: "salario",
    tipo: "transferencia",
    valor: 720_000,
    ...campos,
  };
}

function salvarEntrada(entrada: EntradaASalvar): Comando {
  return { tipo: "salvar-entrada", entrada };
}

function salvar(estado: Estado, entrada: EntradaASalvar): Estado {
  const resultado = aplicar(estado, salvarEntrada(entrada), HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}

function poteDe(vista: VistaDoMes, id: string) {
  return vista.potes.find((p) => p.id === id)!;
}

function pcts(...valores: [number, number, number, number, number, number]): Percentuais {
  return Object.fromEntries(POTES.map((p, i) => [p.id, valores[i]])) as Percentuais;
}
