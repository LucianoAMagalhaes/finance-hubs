import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  grupos,
  matizDaTag,
  normalizarTag,
  POTES,
  projetarMes,
  tagsEmUso,
  todosOsGastos,
  TIPOS_DE_PAGAMENTO,
  type Comando,
  type Compra,
  type Data,
  type Eixo,
  type Estado,
  type LancamentoASalvar,
  type Mes,
  type PoteId,
  type TipoDePagamento,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

describe("tag do lançamento", () => {
  it("\"#Saúde Mental\" e \"saúde-mental\" viram a mesma tag", () => {
    let estado = salvar(estadoVazio(), gasto({ tag: "#Saúde Mental", valor: 10_000 }));
    estado = salvar(estado, gasto({ tag: "saúde-mental", valor: 5_000 }));

    const tags = grupos(projetarMes(estado, "2026-09"), "tag");

    expect(tags.map((g) => [g.nome, g.total])).toEqual([["#saúde-mental", 15_000]]);
    expect(estado.lancamentos.map((l) => (l as Compra).tag)).toEqual(["saúde-mental", "saúde-mental"]);
  });

  it.each([
    ["  Transporte ", "transporte"],
    ["##Uber", "uber"],
    ["# casa  nova ", "casa-nova"],
    ["SAÚDE", "saúde"],
    ["sau\u0301de", "saúde"],
  ])("%j é gravada como %j", (digitada, gravada) => {
    const estado = salvar(estadoVazio(), gasto({ tag: digitada }));

    expect(estado.lancamentos[0]).toMatchObject({ tag: gravada });
  });

  it("acento é preservado: \"saude\" e \"saúde\" são tags diferentes", () => {
    let estado = salvar(estadoVazio(), gasto({ tag: "saude" }));
    estado = salvar(estado, gasto({ tag: "saúde" }));

    expect(grupos(projetarMes(estado, "2026-09"), "tag").map((g) => g.nome)).toEqual(["#saude", "#saúde"]);
  });

  it.each([["sem tag", undefined], ["tag vazia", ""], ["só espaços", "   "], ["só \"#\"", " # "], ["null", null]])(
    "%s grava o lançamento sem tag",
    (_, tag) => {
      const estado = salvar(estadoVazio(), gasto({ tag }));

      expect(estado.lancamentos[0]).toMatchObject({ tag: null });
    },
  );

  it("tag que não é texto é recusada", () => {
    expect(aplicar(estadoVazio(), salvarLancamento(gasto({ tag: 42 as never })), HOJE).ok).toBe(false);
  });

  it("corrigir o lançamento pode trocar ou tirar a tag", () => {
    const estado = salvar(estadoVazio(), gasto({ tag: "uber" }));
    const id = estado.lancamentos[0]!.id;

    expect(salvar(estado, { ...gasto({ tag: "Transporte" }), id }).lancamentos[0]).toMatchObject({ tag: "transporte" });
    expect(salvar(estado, { ...gasto({ tag: "" }), id }).lancamentos[0]).toMatchObject({ tag: null });
  });

  it("a ocorrência leva a tag do lançamento", () => {
    const estado = salvar(estadoVazio(), gasto({ tag: "casa" }));

    expect(projetarMes(estado, "2026-09").ocorrencias[0]!.tag).toBe("casa");
  });

  it("as tags em uso são as dos lançamentos, sem repetir, em ordem alfabética", () => {
    let estado = salvar(estadoVazio(), gasto({ tag: "uber" }));
    estado = salvar(estado, gasto({ tag: "casa", data: "2027-01-10" }));
    estado = salvar(estado, gasto({ tag: "Uber" }));
    estado = salvar(estado, gasto({}));

    expect(tagsEmUso(estado)).toEqual(["casa", "uber"]);
  });

  it("normalizarTag é a mesma regra que o comando aplica", () => {
    expect(normalizarTag("#Saúde Mental")).toBe("saúde-mental");
    expect(normalizarTag(" # ")).toBeNull();
  });

  it("a cor da tag é um de oito matizes, derivado só do nome", () => {
    const matizes = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "transporte", "casa"].map(matizDaTag));

    expect(matizDaTag("transporte")).toBe(matizDaTag("transporte"));
    expect(matizes.size).toBeGreaterThan(1);
    expect(matizes.size).toBeLessThanOrEqual(8);
  });
});

describe("grupos de um eixo", () => {
  it("no eixo pote, os seis potes em ordem, com o total de cada um", () => {
    const estado = salvar(estadoVazio(), gasto({ pote: "conforto", valor: 42_000 }));

    const potes = grupos(projetarMes(estado, "2026-09"), "pote");

    expect(potes.map((g) => g.chave)).toEqual(POTES.map((p) => p.id));
    expect(potes.find((g) => g.chave === "conforto")).toMatchObject({ nome: "Conforto", total: 42_000 });
  });

  it("o grupo \"sem tag\" existe quando há ocorrência sem tag, e vem por último", () => {
    let estado = salvar(estadoVazio(), gasto({ tag: "uber", valor: 3_000 }));
    estado = salvar(estado, gasto({ valor: 7_000 }));
    estado = salvar(estado, gasto({ tag: "casa", valor: 1_000 }));

    const tags = grupos(projetarMes(estado, "2026-09"), "tag");

    expect(tags.map((g) => [g.chave, g.nome, g.total])).toEqual([
      ["casa", "#casa", 1_000],
      ["uber", "#uber", 3_000],
      [null, "sem tag", 7_000],
    ]);
  });

  it("sem ocorrência sem tag, não há grupo \"sem tag\"", () => {
    const estado = salvar(estadoVazio(), gasto({ tag: "uber" }));

    expect(grupos(projetarMes(estado, "2026-09"), "tag").map((g) => g.chave)).toEqual(["uber"]);
  });

  it("no eixo tipo, só os tipos usados no mês, na ordem da lista", () => {
    let estado = salvar(estadoVazio(), gasto({ tipo: "pix" }));
    estado = salvar(estado, gasto({ tipo: "dinheiro" }));
    estado = salvar(estado, gasto({ tipo: "boleto", data: "2026-10-05" }));

    expect(grupos(projetarMes(estado, "2026-09"), "tipo").map((g) => g.nome)).toEqual(["Dinheiro", "PIX"]);
  });

  it("um grupo de tipo de pagamento pode ficar negativo: só reembolso", () => {
    let estado = salvar(estadoVazio(), gasto({ tipo: "cartao-de-credito", valor: 50_000 }));
    estado = salvar(estado, gasto({ tipo: "pix", valor: -29_790 }));

    const pix = grupos(projetarMes(estado, "2026-09"), "tipo").find((g) => g.chave === "pix")!;

    expect(pix.total).toBe(-29_790);
    expect(pix.ocorrencias).toHaveLength(1);
  });

  it("as ocorrências de um grupo vêm em ordem de data", () => {
    let estado = salvar(estadoVazio(), gasto({ data: "2026-09-20", descricao: "Farmácia", tag: "saúde" }));
    estado = salvar(estado, gasto({ data: "2026-09-03", descricao: "Consulta", tag: "saúde" }));

    const saude = grupos(projetarMes(estado, "2026-09"), "tag")[0]!;

    expect(saude.ocorrencias.map((o) => o.descricao)).toEqual(["Consulta", "Farmácia"]);
  });

  it("\"Todos os gastos do mês\" tem todas as ocorrências e soma as despesas", () => {
    let estado = salvar(estadoVazio(), gasto({ valor: 50_000 }));
    estado = salvar(estado, gasto({ valor: -1_000, tag: "casa" }));
    estado = salvar(estado, gasto({ data: "2026-10-01" }));
    const vista = projetarMes(estado, "2026-09");

    const todos = todosOsGastos(vista);

    expect(todos.nome).toBe("Todos os gastos do mês");
    expect(todos.total).toBe(49_000);
    expect(todos.ocorrencias).toEqual(vista.ocorrencias);
  });
});

describe("invariante dos eixos (propriedade)", () => {
  const EIXOS: Eixo[] = ["pote", "tipo", "tag"];
  const MESES: Mes[] = ["2026-08", "2026-09", "2026-10"];

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("estado gerado com a semente %i", (semente) => {
    const estado = estadoGerado(semente);

    for (const mes of MESES) {
      const vista = projetarMes(estado, mes);
      const somaDosPotes = vista.potes.reduce((s, p) => s + p.total, 0);
      expect(somaDosPotes).toBe(vista.agregados.despesas);

      for (const eixo of EIXOS) {
        const gs = grupos(vista, eixo);
        expect(gs.reduce((s, g) => s + g.total, 0), `eixo ${eixo} em ${mes}`).toBe(vista.agregados.despesas);
        // Cada ocorrência cai em exatamente um grupo do eixo.
        const vistas = gs.flatMap((g) => g.ocorrencias);
        expect(vistas).toHaveLength(vista.ocorrencias.length);
        expect(new Set(vistas)).toEqual(new Set(vista.ocorrencias));
        for (const g of gs) expect(g.total).toBe(g.ocorrencias.reduce((s, o) => s + o.valor, 0));
      }
      expect(todosOsGastos(vista).total).toBe(vista.agregados.despesas);
    }
  });

  /** Entradas, gastos e reembolsos, com e sem tag, espalhados por três meses, todos por comando. */
  function estadoGerado(semente: number): Estado {
    const aleatorio = gerador(semente);
    const um = <T,>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)]!;
    const data = (): Data => `${um(MESES)}-${String(1 + Math.floor(aleatorio() * 28)).padStart(2, "0")}` as Data;
    const TAGS = ["#Transporte", "transporte", "Saúde Mental", "saude", "casa", "", "  "];
    const comandos: Comando[] = [];
    for (let i = Math.floor(aleatorio() * 4); i > 0; i--) {
      comandos.push({
        tipo: "salvar-entrada",
        entrada: { data: data(), descricao: "Salário", fonte: "salario", tipo: "pix", valor: 1 + Math.floor(aleatorio() * 1_000_000) },
      });
    }
    for (let i = Math.floor(aleatorio() * 25); i > 0; i--) {
      const valor = 1 + Math.floor(aleatorio() * 200_000);
      comandos.push(
        salvarLancamento(
          gasto({
            data: data(),
            pote: um(POTES).id,
            tipo: um(TIPOS_DE_PAGAMENTO).id,
            valor: aleatorio() < 0.25 ? -valor : valor,
            tag: aleatorio() < 0.3 ? undefined : um(TAGS),
          }),
        ),
      );
    }
    return comandos.reduce((estado, comando) => {
      const resultado = aplicar(estado, comando, HOJE);
      if (!resultado.ok) throw new Error(resultado.erro);
      return resultado.valor;
    }, estadoVazio());
  }
});

/** mulberry32: reproduzível, para que uma semente que falha falhe sempre. */
function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function gasto(campos: {
  data?: Data;
  descricao?: string;
  pote?: PoteId;
  tipo?: TipoDePagamento;
  valor?: number;
  tag?: string | null;
}): LancamentoASalvar {
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
