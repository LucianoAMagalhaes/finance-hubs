import { describe, expect, it } from "vitest";
import {
  aplicar,
  divisaoEmParcelas,
  estadoVazio,
  grupos,
  POTES,
  projetarMes,
  somarMeses,
  TIPOS_DE_PAGAMENTO,
  todosOsGastos,
  ultimoDiaDoMes,
  type Comando,
  type Compra,
  type Data,
  type Eixo,
  type Estado,
  type LancamentoASalvar,
  type Mes,
  type NovoLancamento,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

describe("parcelas de um parcelado", () => {
  it("R$ 1.000 em 3× são 333,34 + 333,33 + 333,33 a partir do mês da compra, e nada fora deles", () => {
    const estado = salvar(estadoVazio(), parcelado({ data: "2026-09-12", valor: 100_000, parcelas: 3 }));

    expect(valoresPorMes(estado, ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"])).toEqual([[], [33_334], [33_333], [33_333], []]);
  });

  it("a ocorrência diz qual parcela é, de quantas, e de que total", () => {
    const estado = salvar(estadoVazio(), parcelado({ data: "2026-06-18", valor: 389_900, parcelas: 10 }));

    const [ocorrencia] = projetarMes(estado, "2026-09").ocorrencias;

    expect(ocorrencia).toMatchObject({ valor: 38_990, parcela: { numero: 4, de: 10, total: 389_900 } });
  });

  it("o à vista não é parcela", () => {
    const estado = salvar(estadoVazio(), parcelado({ parcelas: 1 }));

    expect(projetarMes(estado, "2026-09").ocorrencias[0]!.parcela).toBeNull();
  });

  it("a parcela cai no dia da compra, limitado ao último dia do mês", () => {
    const estado = salvar(estadoVazio(), parcelado({ data: "2026-01-31", parcelas: 3 }));

    expect(projetarMes(estado, "2026-02").ocorrencias[0]!.data).toBe("2026-02-28");
    expect(projetarMes(estado, "2026-03").ocorrencias[0]!.data).toBe("2026-03-31");
  });

  it("um parcelado que começou antes do app, lançado com a data original, só tem as restantes daqui para frente", () => {
    const estado = salvar(estadoVazio(), parcelado({ data: "2026-03-10", valor: 120_000, parcelas: 10 }));

    expect(projetarMes(estado, "2026-09").ocorrencias[0]!.parcela).toMatchObject({ numero: 7 });
    expect(projetarMes(estado, "2026-12").ocorrencias[0]!.parcela).toMatchObject({ numero: 10 });
    expect(projetarMes(estado, "2027-01").ocorrencias).toEqual([]);
  });

  it("um reembolso parcelado divide o total negativo do mesmo jeito", () => {
    const estado = salvar(estadoVazio(), parcelado({ valor: -100_000, parcelas: 3 }));

    expect(valoresPorMes(estado, ["2026-09", "2026-10", "2026-11"])).toEqual([[-33_334], [-33_333], [-33_333]]);
  });

  it("as parcelas sempre somam o total, e o centavo que sobra fica na primeira", () => {
    for (const [total, n] of [[100_000, 3], [1, 2], [-1, 2], [99_999, 7], [-389_900, 10], [5, 12], [42_000, 1]] as const) {
      const { primeira, demais } = divisaoEmParcelas(total, n);
      expect(primeira + demais * (n - 1), `${total} em ${n}×`).toBe(total);
      expect(Math.sign(primeira)).toBe(Math.sign(total));
      expect(Math.abs(primeira - demais)).toBeLessThan(n);
    }
  });
});

describe("validação do parcelado", () => {
  it.each(TIPOS_DE_PAGAMENTO.filter((t) => t.id !== "cartao-de-credito").map((t) => t.id))(
    "mais de uma parcela em %s é recusado",
    (tipo) => {
      expect(aplicar(estadoVazio(), salvarLancamento(parcelado({ tipo, parcelas: 3 })), HOJE)).toEqual({
        ok: false,
        erro: expect.stringMatching(/Cartão de Crédito/),
      });
    },
  );

  it.each([
    ["zero parcelas", 0],
    ["parcelas negativas", -2],
    ["parcelas fracionadas", 2.5],
    ["parcelas que não são número", "3" as never],
  ])("%s é recusado", (_, parcelas) => {
    expect(aplicar(estadoVazio(), salvarLancamento(parcelado({ parcelas })), HOJE).ok).toBe(false);
  });
});

describe("corrigir um parcelado", () => {
  it("corrigir o total muda todas as parcelas, inclusive as de meses passados", () => {
    const estado = salvar(estadoVazio(), parcelado({ data: "2026-07-05", valor: 90_000, parcelas: 3 }));
    const id = projetarMes(estado, "2026-07").ocorrencias[0]!.lancamento;

    const corrigido = salvar(estado, { ...parcelado({ data: "2026-07-05", valor: 120_000, parcelas: 3 }), id });

    expect(valoresPorMes(corrigido, ["2026-07", "2026-08", "2026-09"])).toEqual([[40_000], [40_000], [40_000]]);
  });

  it("trocar para à vista deixa uma ocorrência só, com o total, no mês da compra", () => {
    const estado = salvar(estadoVazio(), parcelado({ data: "2026-07-05", valor: 90_000, parcelas: 3 }));
    const id = projetarMes(estado, "2026-07").ocorrencias[0]!.lancamento;

    const aVista = salvar(estado, { ...parcelado({ data: "2026-07-05", valor: 90_000, parcelas: 1 }), id });

    expect(valoresPorMes(aVista, ["2026-07", "2026-08", "2026-09"])).toEqual([[90_000], [], []]);
  });

  it("trocar de à vista para parcelado espalha o total pelos meses", () => {
    const estado = salvar(estadoVazio(), parcelado({ valor: 60_000, parcelas: 1 }));
    const id = projetarMes(estado, "2026-09").ocorrencias[0]!.lancamento;

    const emParcelas = salvar(estado, { ...parcelado({ valor: 60_000, parcelas: 2 }), id });

    expect(valoresPorMes(emParcelas, ["2026-09", "2026-10"])).toEqual([[30_000], [30_000]]);
  });
});

describe("nascimento do mês com parcelado", () => {
  it("só o mês da compra nasce: a 4ª parcela caindo em dezembro não faz dezembro nascer", () => {
    const estado = salvar(estadoVazio(), parcelado({ data: "2026-09-12", parcelas: 4 }));

    expect(projetarMes(estado, "2026-09").orcamento.nascido).toBe(true);
    for (const mes of ["2026-10", "2026-11", "2026-12"] as const) {
      expect(projetarMes(estado, mes).ocorrencias, mes).toHaveLength(1);
      expect(projetarMes(estado, mes).orcamento.nascido, mes).toBe(false);
    }
  });
});

describe("invariante dos eixos com parcelados (propriedade)", () => {
  const EIXOS: Eixo[] = ["pote", "tipo", "tag"];
  const MESES: Mes[] = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("estado gerado com a semente %i", (semente) => {
    const estado = estadoGerado(semente);

    for (const mes of MESES) {
      const vista = projetarMes(estado, mes);
      expect(vista.potes.reduce((s, p) => s + p.total, 0)).toBe(vista.agregados.despesas);
      for (const eixo of EIXOS) {
        const gs = grupos(vista, eixo);
        expect(gs.reduce((s, g) => s + g.total, 0), `eixo ${eixo} em ${mes}`).toBe(vista.agregados.despesas);
        expect(new Set(gs.flatMap((g) => g.ocorrencias))).toEqual(new Set(vista.ocorrencias));
        expect(gs.flatMap((g) => g.ocorrencias)).toHaveLength(vista.ocorrencias.length);
      }
      expect(todosOsGastos(vista).total).toBe(vista.agregados.despesas);
    }
    // Somadas em todos os meses, as parcelas de cada compra dão o seu total.
    for (const l of estado.lancamentos) {
      // A última parcela possível: 12× a partir de dezembro cai em novembro do ano seguinte.
      const soma = Array.from({ length: 17 }, (_, i) => somarMeses("2026-07", i))
        .flatMap((m) => projetarMes(estado, m).ocorrencias)
        .filter((o) => o.lancamento === l.id)
        .reduce((s, o) => s + o.valor, 0);
      expect(soma).toBe((l as Compra).valor);
    }
  });

  /** Compras à vista e parceladas, reembolsos e correções de forma, espalhadas por meses. */
  function estadoGerado(semente: number): Estado {
    const aleatorio = gerador(semente);
    const um = <T,>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)]!;
    const data = (): Data => {
      const mes = um(MESES);
      return `${mes}-${String(1 + Math.floor(aleatorio() * ultimoDiaDoMes(mes))).padStart(2, "0")}` as Data;
    };
    let estado = estadoVazio();
    for (let i = Math.floor(aleatorio() * 20); i > 0; i--) {
      const valor = 1 + Math.floor(aleatorio() * 500_000);
      const parcelas = aleatorio() < 0.5 ? 1 : 2 + Math.floor(aleatorio() * 11);
      const corrigir = estado.lancamentos.length > 0 && aleatorio() < 0.2;
      const dados = parcelado({
        ...(corrigir && { id: um(estado.lancamentos).id }),
        data: data(),
        pote: um(POTES).id,
        tipo: parcelas > 1 ? "cartao-de-credito" : um(TIPOS_DE_PAGAMENTO).id,
        valor: aleatorio() < 0.25 ? -valor : valor,
        parcelas,
        tag: aleatorio() < 0.4 ? null : um(["transporte", "casa", "#Saúde"]),
      });
      estado = salvar(estado, dados);
    }
    return estado;
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

function valoresPorMes(estado: Estado, meses: Mes[]): number[][] {
  return meses.map((m) => projetarMes(estado, m).ocorrencias.map((o) => o.valor));
}

function parcelado(campos: Partial<NovoLancamento> & { id?: number }): LancamentoASalvar {
  return {
    data: "2026-09-12",
    descricao: "Notebook",
    pote: "conforto",
    tipo: "cartao-de-credito",
    valor: 100_000,
    parcelas: 3,
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
