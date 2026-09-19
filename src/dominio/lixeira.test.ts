import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  itensNaLixeira,
  projetarMes,
  tagsEmUso,
  type Comando,
  type Data,
  type EntradaASalvar,
  type Estado,
  type LancamentoASalvar,
  type Mes,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

describe("lixeira", () => {
  it("apagar uma entrada tira a receita do mês; restaurar devolve exatamente a projeção de antes", () => {
    let estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05", valor: 720_000 }));
    estado = aplicarOk(estado, salvarEntrada({ data: "2026-09-20", valor: 90_000 }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-12", valor: 250_000 }));
    const antes = projetarMes(estado, "2026-09");

    const apagado = aplicarOk(estado, { tipo: "apagar", registro: "entrada", id: 1 });

    expect(projetarMes(apagado, "2026-09").receita).toBe(90_000);
    expect(projetarMes(apagado, "2026-09").entradas.map((e) => e.id)).toEqual([2]);
    expect(projetarMes(apagado, "2026-09").potes.find((p) => p.id === "conforto")!.veredito).toBe("estourou");

    const restaurado = aplicarOk(apagado, { tipo: "restaurar", registro: "entrada", id: 1 });

    expect(projetarMes(restaurado, "2026-09")).toEqual(antes);
    expect(restaurado).toEqual(estado);
  });

  it("apagar um parcelado tira todas as parcelas; restaurar devolve todas", () => {
    const meses: Mes[] = ["2026-09", "2026-10", "2026-11"];
    const estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-09-12", valor: 100_000, parcelas: 3 }));
    const antes = meses.map((m) => projetarMes(estado, m));

    const apagado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    for (const m of meses) {
      expect(projetarMes(apagado, m).ocorrencias).toEqual([]);
      expect(projetarMes(apagado, m).agregados.despesas).toBe(0);
    }

    const restaurado = aplicarOk(apagado, { tipo: "restaurar", registro: "lancamento", id: 1 });

    expect(meses.map((m) => projetarMes(restaurado, m))).toEqual(antes);
    expect(meses.map((m) => projetarMes(restaurado, m).ocorrencias.map((o) => o.valor))).toEqual([[33_334], [33_333], [33_333]]);
  });

  it("apagar tudo de um mês mantém o orçamento do mês com os seus percentuais", () => {
    let estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-12", valor: 42_050 }));
    const percentuais = { "custos-fixos": 40, "liberdade-financeira": 20, conforto: 15, metas: 10, conhecimento: 10, prazeres: 5 };
    estado = aplicarOk(estado, { tipo: "salvar-percentuais", mes: "2026-09", percentuais });

    estado = aplicarOk(estado, { tipo: "apagar", registro: "entrada", id: 1 });
    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    const vista = projetarMes(estado, "2026-09");
    expect(estado.orcamentos["2026-09"]).toEqual(percentuais);
    expect(vista.orcamento.nascido).toBe(true);
    expect(vista.potes.map((p) => p.percentual)).toEqual([40, 20, 15, 10, 10, 5]);
    expect(vista.receita).toBe(0);
    expect(vista.potes.map((p) => p.veredito)).toEqual(Array(6).fill("sem-receita"));
  });

  it("a lixeira lista o que foi apagado, o mais recente primeiro, e restaurar tira de lá", () => {
    let estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-12", valor: 42_050 }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-13", valor: 10_000 }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 2 }, "2026-09-10");
    estado = aplicarOk(estado, { tipo: "apagar", registro: "entrada", id: 1 }, "2026-09-18");

    expect(itensNaLixeira(estado).map((i) => [i.registro, i.id, i.apagadoEm])).toEqual([
      ["entrada", 1, "2026-09-18"],
      ["lancamento", 2, "2026-09-10"],
    ]);

    estado = aplicarOk(estado, { tipo: "restaurar", registro: "entrada", id: 1 });

    expect(itensNaLixeira(estado).map((i) => [i.registro, i.id])).toEqual([["lancamento", 2]]);
  });

  it("a tag de um lançamento na lixeira deixa de estar em uso", () => {
    let estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-09-12", valor: 4_000, tag: "saúde" }));
    estado = aplicarOk(estado, salvarLancamento({ data: "2026-09-13", valor: 2_000, tag: "transporte" }));

    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    expect(tagsEmUso(estado)).toEqual(["transporte"]);
  });

  it("não se apaga o que não existe ou já está na lixeira, nem se restaura o que não está", () => {
    let estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));

    expect(aplicar(estado, { tipo: "apagar", registro: "entrada", id: 9 }, HOJE).ok).toBe(false);
    expect(aplicar(estado, { tipo: "apagar", registro: "lancamento", id: 1 }, HOJE).ok).toBe(false);
    expect(aplicar(estado, { tipo: "restaurar", registro: "entrada", id: 1 }, HOJE).ok).toBe(false);

    estado = aplicarOk(estado, { tipo: "apagar", registro: "entrada", id: 1 });

    expect(aplicar(estado, { tipo: "apagar", registro: "entrada", id: 1 }, HOJE).ok).toBe(false);
  });

  it("o comando chega do navegador: registro que não é entrada nem lançamento é recusado", () => {
    const estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-09-12", valor: 42_050 }));

    const resultado = aplicar(estado, { tipo: "apagar", registro: "orcamento" as never, id: 1 }, HOJE);

    expect(resultado).toEqual({ ok: false, erro: "Só entrada ou lançamento vão para a lixeira." });
  });

  it("um item na lixeira não pode ser corrigido: volta primeiro, corrige depois", () => {
    let estado = aplicarOk(estadoVazio(), salvarLancamento({ data: "2026-09-12", valor: 42_050 }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });

    const resultado = aplicar(estado, salvarLancamento({ id: 1, data: "2026-09-12", valor: 50_000 }), HOJE);

    expect(resultado.ok).toBe(false);
  });

  it("um registro novo não reaproveita o id de um que está na lixeira", () => {
    let estado = aplicarOk(estadoVazio(), salvarEntrada({ data: "2026-09-05" }));
    estado = aplicarOk(estado, { tipo: "apagar", registro: "entrada", id: 1 });

    estado = aplicarOk(estado, salvarEntrada({ data: "2026-09-06" }));

    expect(estado.entradas.map((e) => e.id)).toEqual([1, 2]);
  });

  it("apagar e restaurar não fazem mês nenhum nascer", () => {
    // Um estado anterior ao nascimento automático: o lançamento existe, o mês não nasceu.
    const estado: Estado = {
      ...estadoVazio(),
      lancamentos: [
        { id: 1, data: "2026-09-12", descricao: "Café", pote: "conforto", tipo: "pix", valor: 1_000, parcelas: 1, tag: null, apagadoEm: null },
      ],
    };

    const apagado = aplicarOk(estado, { tipo: "apagar", registro: "lancamento", id: 1 });
    const restaurado = aplicarOk(apagado, { tipo: "restaurar", registro: "lancamento", id: 1 });

    expect(apagado.orcamentos).toEqual({});
    expect(restaurado).toEqual(estado);
  });
});

function salvarEntrada(campos: Partial<EntradaASalvar> & { data: Data }): Comando {
  return {
    tipo: "salvar-entrada",
    entrada: { descricao: "Salário", fonte: "salario", tipo: "transferencia", valor: 720_000, ...campos },
  };
}

function salvarLancamento(campos: Partial<LancamentoASalvar> & { data: Data; valor: number }): Comando {
  return {
    tipo: "salvar-lancamento",
    lancamento: { descricao: "Restaurante", pote: "conforto", tipo: "cartao-de-credito", parcelas: 1, ...campos },
  };
}

function aplicarOk(estado: Estado, comando: Comando, hoje: Data = HOJE): Estado {
  const resultado = aplicar(estado, comando, hoje);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}
