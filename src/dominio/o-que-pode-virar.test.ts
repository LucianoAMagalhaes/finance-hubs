import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  oQuePodeVirar,
  porQueNaoParcela,
  type Comando,
  type Data,
  type Estado,
  type Lancamento,
  type LancamentoASalvar,
  type Mes,
  type RecorrenteACriar,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

// Cada caso confere os dois lados: o que a consulta diz travado, `aplicar`
// recusa com a mesma frase; o que ela diz livre, `aplicar` aceita.

describe("o que um lançamento pode virar", () => {
  it("um lançamento novo pode ter qualquer forma, com tudo livre e nada a encerrar", () => {
    expect(oQuePodeVirar(null, "2026-09")).toEqual({
      formas: { "a-vista": null, parcelado: null, recorrente: null },
      trava: null,
      encerrar: null,
    });
    expect(aceita(estadoVazio(), salvarLancamento(COMPRA))).toBe(true);
    expect(aceita(estadoVazio(), salvarLancamento({ ...COMPRA, parcelas: 3 }))).toBe(true);
    expect(aceita(estadoVazio(), { tipo: "criar-recorrente", recorrente: ALUGUEL })).toBe(true);
  });

  it("um recorrente não vira compra, com a mesma recusa que salvá-lo como compra daria", () => {
    const estado = apos({ tipo: "criar-recorrente", recorrente: ALUGUEL });

    const { formas, trava } = oQuePodeVirar(lancamentoDe(estado), "2026-07");

    expect(formas["a-vista"]).toBe("Um recorrente não vira compra: apague e lance de novo.");
    expect(recusa(estado, salvarLancamento({ ...COMPRA, id: 1 }))).toBe(formas["a-vista"]);
    expect(recusa(estado, salvarLancamento({ ...COMPRA, id: 1, parcelas: 3 }))).toBe(formas.parcelado);
    expect(formas.recorrente).toBeNull();
    expect(trava).toBeNull();
    expect(aceita(estado, { tipo: "mudar-recorrente", id: 1, mes: "2026-07", vigencia: { ...ALUGUEL, valor: 160_000 } })).toBe(true);
  });

  it("uma compra à vista vira parcelado e volta, mas não vira recorrente", () => {
    const estado = apos(salvarLancamento(COMPRA));

    const { formas, trava } = oQuePodeVirar(lancamentoDe(estado), "2026-07");

    expect(formas["a-vista"]).toBeNull();
    expect(formas.parcelado).toBeNull();
    expect(trava).toBeNull();
    expect(aceita(estado, salvarLancamento({ ...COMPRA, id: 1, parcelas: 3 }))).toBe(true);
    expect(formas.recorrente).toBe("Uma compra não vira recorrente: apague e lance de novo.");
    expect(recusa(estado, { tipo: "mudar-recorrente", id: 1, mes: "2026-07", vigencia: COMPRA })).toBe(formas.recorrente);
  });

  it("um parcelado sem antecipação muda de data, total e parcelas, e volta a ser à vista", () => {
    const estado = apos(salvarLancamento(EM_DEZ));

    const { formas, trava } = oQuePodeVirar(lancamentoDe(estado), "2026-07");

    expect(trava).toBeNull();
    expect(formas["a-vista"]).toBeNull();
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, data: "2026-02-15", valor: 400_000, parcelas: 12 }))).toBe(true);
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, parcelas: 1 }))).toBe(true);
  });

  describe("um parcelado com antecipação", () => {
    const estado = apos(salvarLancamento(EM_DEZ), ANTECIPAR_3_EM_JULHO);
    const { formas, trava } = oQuePodeVirar(lancamentoDe(estado), "2026-07");
    const corrigido = { ...EM_DEZ, id: 1 };

    it("trava data, total e parcelas com a mesma recusa que mudá-los daria", () => {
      expect(trava).toBe("Este parcelado tem antecipação: desfaça-a antes de mudar a data, o total ou o número de parcelas.");
      expect(recusa(estado, salvarLancamento({ ...corrigido, data: "2026-02-15" }))).toBe(trava);
      expect(recusa(estado, salvarLancamento({ ...corrigido, valor: 400_000 }))).toBe(trava);
      expect(recusa(estado, salvarLancamento({ ...corrigido, parcelas: 12 }))).toBe(trava);
    });

    it("continua livre para descrição, pote e tag", () => {
      expect(aceita(estado, salvarLancamento({ ...corrigido, descricao: "Notebook novo", pote: "metas", tag: "trabalho" }))).toBe(true);
    });

    it("não volta a ser à vista, pela mesma trava", () => {
      expect(formas.parcelado).toBeNull();
      expect(formas["a-vista"]).toBe(trava);
      expect(recusa(estado, salvarLancamento({ ...corrigido, parcelas: 1 }))).toBe(trava);
    });

    it("não vira recorrente por ser compra, que é o motivo que vence a trava", () => {
      expect(formas.recorrente).toBe("Uma compra não vira recorrente: apague e lance de novo.");
      expect(recusa(estado, { tipo: "mudar-recorrente", id: 1, mes: "2026-07", vigencia: EM_DEZ })).toBe(formas.recorrente);
    });
  });

  it("um parcelado cuja antecipação foi desfeita volta a ficar livre", () => {
    const estado = apos(salvarLancamento(EM_DEZ), ANTECIPAR_3_EM_JULHO, { tipo: "apagar", registro: "antecipacao", id: 1 });

    const { formas, trava } = oQuePodeVirar(lancamentoDe(estado), "2026-07");

    expect(trava).toBeNull();
    expect(formas["a-vista"]).toBeNull();
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, data: "2026-02-15", valor: 400_000 }))).toBe(true);
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, parcelas: 1 }))).toBe(true);
  });

  it("um parcelado na lixeira não se diz travado pela antecipação: a recusa é de quem grava", () => {
    const estado = apos(salvarLancamento(EM_DEZ), ANTECIPAR_3_EM_JULHO, { tipo: "apagar", registro: "lancamento", id: 1 });

    expect(oQuePodeVirar(lancamentoDe(estado), "2026-07").trava).toBeNull();
    expect(recusa(estado, salvarLancamento({ ...EM_DEZ, id: 1, parcelas: 12 }))).toBe("Esse lançamento não existe mais.");
  });
});

describe("só Cartão de Crédito parcela", () => {
  it("fora do cartão, a recusa é a mesma que salvar o parcelado daria", () => {
    expect(porQueNaoParcela("pix")).toBe("Só Cartão de Crédito parcela.");
    expect(recusa(estadoVazio(), salvarLancamento({ ...COMPRA, tipo: "pix", parcelas: 3 }))).toBe(porQueNaoParcela("pix"));
  });

  it("no cartão, parcela", () => {
    expect(porQueNaoParcela("cartao-de-credito")).toBeNull();
  });
});

describe("encerrar um recorrente", () => {
  // Aluguel desde junho, reajustado em agosto: duas vigências.
  const estado = apos(
    { tipo: "criar-recorrente", recorrente: ALUGUEL },
    { tipo: "mudar-recorrente", id: 1, mes: "2026-08", vigencia: { ...ALUGUEL, valor: 165_000 } },
  );
  const aluguel = lancamentoDe(estado);
  const encerrado = (mes: Mes) => lancamentoDe(aplicarOk(estado, { tipo: "encerrar-recorrente", id: 1, mes }));

  it("no mês de início manda o recorrente inteiro para a lixeira", () => {
    expect(oQuePodeVirar(aluguel, "2026-06").encerrar).toEqual({ tipo: "lixeira" });
    expect(encerrado("2026-06").apagadoEm).toBe(HOJE);
  });

  it("antes do reajuste descarta a vigência que vinha depois", () => {
    expect(oQuePodeVirar(aluguel, "2026-07").encerrar).toEqual({ tipo: "encerra", descartadas: 1 });
    expect(encerrado("2026-07")).toMatchObject({ apagadoEm: null, encerradoEm: "2026-07", vigencias: [{ desde: "2026-06" }] });
  });

  it("depois do reajuste não descarta nenhuma", () => {
    expect(oQuePodeVirar(aluguel, "2026-09").encerrar).toEqual({ tipo: "encerra", descartadas: 0 });
    expect(encerrado("2026-09")).toMatchObject({ vigencias: [{ desde: "2026-06" }, { desde: "2026-08" }] });
  });

  it("uma compra não tem o que encerrar", () => {
    expect(oQuePodeVirar(lancamentoDe(apos(salvarLancamento(COMPRA))), "2026-07").encerrar).toBeNull();
  });
});

const COMPRA: LancamentoASalvar = {
  data: "2026-07-10",
  descricao: "Supermercado",
  pote: "custos-fixos",
  tipo: "cartao-de-credito",
  valor: 30_000,
  parcelas: 1,
};

/** Um parcelado de 10× a partir de janeiro. */
const EM_DEZ: LancamentoASalvar = {
  data: "2026-01-15",
  descricao: "Notebook",
  pote: "conforto",
  tipo: "cartao-de-credito",
  valor: 389_900,
  parcelas: 10,
};

/** As 3 últimas parcelas do parcelado 1, antecipadas em julho. */
const ANTECIPAR_3_EM_JULHO: Comando = {
  tipo: "salvar-antecipacao",
  antecipacao: { lancamento: 1, data: "2026-07-20", parcelas: 3, valor: 300_000 },
};

/** Um aluguel recorrente desde junho, com uma vigência só. */
const ALUGUEL: RecorrenteACriar = { data: "2026-06-05", descricao: "Aluguel", pote: "custos-fixos", tipo: "pix", valor: 150_000 };

const salvarLancamento = (lancamento: LancamentoASalvar): Comando => ({ tipo: "salvar-lancamento", lancamento });

const aceita = (estado: Estado, comando: Comando) => aplicar(estado, comando, HOJE).ok;

/** A recusa de um comando, falhando o teste se ele passar. */
function recusa(estado: Estado, comando: Comando): string {
  const resultado = aplicar(estado, comando, HOJE);
  if (resultado.ok) throw new Error(`o comando ${comando.tipo} passou`);
  return resultado.erro;
}

/** O estado depois dos comandos, em ordem, a partir do vazio. */
const apos = (...comandos: Comando[]): Estado => comandos.reduce(aplicarOk, estadoVazio());

function aplicarOk(estado: Estado, comando: Comando): Estado {
  const resultado = aplicar(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}

function lancamentoDe(estado: Estado, id = 1): Lancamento {
  const l = estado.lancamentos.find((x) => x.id === id);
  if (!l) throw new Error(`${id} não existe`);
  return l;
}
