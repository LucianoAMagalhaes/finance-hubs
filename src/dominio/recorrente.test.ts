import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  grupos,
  itensNaLixeira,
  POTES,
  projetarMes,
  somarMeses,
  tagsEmUso,
  TIPOS_DE_PAGAMENTO,
  todosOsGastos,
  ultimoDiaDoMes,
  vigenciasComFim,
  type Comando,
  type Data,
  type Eixo,
  type Estado,
  type Mes,
  type Recorrente,
  type RecorrenteACriar,
  type VigenciaASalvar,
} from "@/dominio";

const HOJE: Data = "2026-09-18";

describe("recorrente sem fim", () => {
  it("cai todo mês a partir do mês de início, no dia do recorrente, e em nenhum antes", () => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-09-05", valor: 5_590 }));

    expect(valoresPorMes(estado, ["2026-08", "2026-09", "2026-10", "2027-09", "2040-01"])).toEqual([[], [5_590], [5_590], [5_590], [5_590]]);
    expect(projetarMes(estado, "2031-03").ocorrencias[0]).toMatchObject({ data: "2031-03-05", descricao: "Netflix", pote: "prazeres" });
  });

  it("aparece num mês muito distante sem custo proporcional ao horizonte", () => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-09-05", valor: 5_590 }));
    const distante = "99999-12" as Mes;

    const inicio = performance.now();
    for (let i = 0; i < 1_000; i++) projetarMes(estado, distante);
    const duracao = performance.now() - inicio;

    expect(projetarMes(estado, distante).ocorrencias.map((o) => [o.data, o.valor])).toEqual([["99999-12-05", 5_590]]);
    // Andar mês a mês até lá seriam ~1,2 milhão de passos por projeção.
    expect(duracao).toBeLessThan(1_000);
  });

  it("a ocorrência diz que é recorrente, desde quando, e desde quando vale a vigência", () => {
    let estado = criar(estadoVazio(), recorrente({ data: "2026-01-05", valor: 150_000 }));
    estado = mudar(estado, 1, "2026-07", vigencia({ valor: 165_000 }));

    expect(projetarMes(estado, "2026-09").ocorrencias[0]).toMatchObject({
      parcela: null,
      recorrente: { desde: "2026-01", vigenciaDesde: "2026-07" },
    });
  });

  it("um reembolso recorrente devolve o mesmo valor todo mês ao pote", () => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-09-10", valor: -2_000 }));

    expect(valoresPorMes(estado, ["2026-09", "2026-12"])).toEqual([[-2_000], [-2_000]]);
    expect(projetarMes(estado, "2026-12").potes.find((p) => p.id === "prazeres")!.total).toBe(-2_000);
  });
});

describe("dia do recorrente", () => {
  it("o dia 31 cai no último dia dos meses mais curtos: 28 ou 29 em fevereiro", () => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-01-31" }));

    expect(datasPorMes(estado, ["2026-01", "2026-02", "2026-03", "2026-04", "2028-02"])).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2028-02-29",
    ]);
  });

  it("o dia é da recorrência: mudar num mês não muda o dia", () => {
    let estado = criar(estadoVazio(), recorrente({ data: "2026-01-31" }));
    estado = mudar(estado, 1, "2026-02", vigencia({ valor: 7_000 }));

    expect(datasPorMes(estado, ["2026-02", "2026-03"])).toEqual(["2026-02-28", "2026-03-31"]);
  });
});

describe("vigências", () => {
  /** Aluguel de R$ 1.500 desde janeiro, que muda para R$ 1.650 em julho. */
  function aluguel(): Estado {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-01-05", descricao: "Aluguel", pote: "custos-fixos", valor: 150_000 }));
    return mudar(estado, 1, "2026-07", vigencia({ descricao: "Aluguel", pote: "custos-fixos", valor: 165_000 }));
  }

  it("mudar num mês vale dali para frente, e os meses anteriores não mudam", () => {
    expect(valoresPorMes(aluguel(), ["2026-01", "2026-06", "2026-07", "2027-03"])).toEqual([[150_000], [150_000], [165_000], [165_000]]);
  });

  it("corrigir março para R$ 1.550 vale até a próxima mudança: julho continua em R$ 1.650", () => {
    const estado = mudar(aluguel(), 1, "2026-03", vigencia({ descricao: "Aluguel", pote: "custos-fixos", valor: 155_000 }));

    expect(valoresPorMes(estado, ["2026-02", "2026-03", "2026-06", "2026-07", "2026-12"])).toEqual([
      [150_000],
      [155_000],
      [155_000],
      [165_000],
      [165_000],
    ]);
    expect(vigenciasComFim(recorrenteDe(estado)).map((v) => [v.desde, v.ate, v.valor])).toEqual([
      ["2026-01", "2026-02", 150_000],
      ["2026-03", "2026-06", 155_000],
      ["2026-07", null, 165_000],
    ]);
  });

  it("mudar de novo num mês que já começa uma vigência a substitui, sem criar outra", () => {
    const estado = mudar(aluguel(), 1, "2026-07", vigencia({ descricao: "Aluguel", pote: "custos-fixos", valor: 170_000 }));

    expect(valoresPorMes(estado, ["2026-06", "2026-07"])).toEqual([[150_000], [170_000]]);
    expect(vigenciasComFim(recorrenteDe(estado))).toHaveLength(2);
  });

  it("para corrigir desde o começo, abre-se o mês de início", () => {
    const estado = mudar(aluguel(), 1, "2026-01", vigencia({ descricao: "Aluguel do apê", pote: "custos-fixos", valor: 150_000 }));

    expect(projetarMes(estado, "2026-01").ocorrencias[0]!.descricao).toBe("Aluguel do apê");
    expect(projetarMes(estado, "2026-06").ocorrencias[0]!.descricao).toBe("Aluguel do apê");
    expect(projetarMes(estado, "2026-07").ocorrencias[0]!.descricao).toBe("Aluguel");
  });

  it("corrigir março para o valor de julho, e depois de novo, não engole julho", () => {
    let estado = mudar(aluguel(), 1, "2026-03", vigencia({ descricao: "Aluguel", pote: "custos-fixos", valor: 165_000 }));
    estado = mudar(estado, 1, "2026-03", vigencia({ descricao: "Aluguel", pote: "custos-fixos", valor: 155_000 }));

    expect(valoresPorMes(estado, ["2026-02", "2026-03", "2026-07"])).toEqual([[150_000], [155_000], [165_000]]);
  });

  it("valor, pote, tipo de pagamento, tag e descrição mudam numa vigência", () => {
    let estado = criar(estadoVazio(), recorrente({ data: "2026-01-10", pote: "prazeres", tipo: "pix", tag: "streaming" }));
    estado = mudar(estado, 1, "2026-05", { descricao: "Curso", pote: "conhecimento", tipo: "boleto", valor: 20_000, tag: "#Estudo" });

    expect(projetarMes(estado, "2026-04").ocorrencias[0]).toMatchObject({ pote: "prazeres", tipo: "pix", tag: "streaming" });
    expect(projetarMes(estado, "2026-05").ocorrencias[0]).toMatchObject({
      descricao: "Curso",
      pote: "conhecimento",
      tipo: "boleto",
      tag: "estudo",
      valor: 20_000,
    });
    expect(tagsEmUso(estado)).toEqual(["estudo", "streaming"]);
  });

  it("mudar fora dos meses em que o recorrente cai é recusado", () => {
    const estado = encerrar(aluguel(), 1, "2026-10");

    expect(aplicar(estado, mudarRecorrente(1, "2025-12", vigencia({})), HOJE).ok).toBe(false);
    expect(aplicar(estado, mudarRecorrente(1, "2026-10", vigencia({})), HOJE).ok).toBe(false);
  });
});

describe("encerrar um recorrente", () => {
  /** Criado em janeiro, com mudanças em outubro e dezembro. */
  function comMudancasFuturas(): Estado {
    let estado = criar(estadoVazio(), recorrente({ data: "2026-01-05", valor: 10_000, tag: "casa" }));
    estado = mudar(estado, 1, "2026-10", vigencia({ valor: 11_000, tag: "reforma" }));
    return mudar(estado, 1, "2026-12", vigencia({ valor: 12_000, tag: "casa" }));
  }

  it("encerrar em setembro some com setembro em diante; os meses anteriores ficam como estavam", () => {
    const estado = encerrar(comMudancasFuturas(), 1, "2026-09");

    expect(valoresPorMes(estado, ["2026-01", "2026-08", "2026-09", "2026-10", "2026-12", "2030-01"])).toEqual([
      [10_000],
      [10_000],
      [],
      [],
      [],
      [],
    ]);
  });

  it("encerrar descarta de vez as vigências a partir do mês de encerramento", () => {
    const estado = encerrar(comMudancasFuturas(), 1, "2026-09");

    expect(vigenciasComFim(recorrenteDe(estado)).map((v) => [v.desde, v.ate])).toEqual([["2026-01", "2026-08"]]);
    expect(tagsEmUso(estado)).toEqual(["casa"]);
    expect(itensNaLixeira(estado)).toEqual([]);
  });

  it("encerrar no mês de uma vigência descarta ela e as seguintes, e mantém as anteriores", () => {
    const estado = encerrar(comMudancasFuturas(), 1, "2026-12");

    expect(valoresPorMes(estado, ["2026-09", "2026-11", "2026-12"])).toEqual([[10_000], [11_000], []]);
    expect(vigenciasComFim(recorrenteDe(estado)).map((v) => v.desde)).toEqual(["2026-01", "2026-10"]);
  });

  it("encerrar de novo, antes, antecipa o fim", () => {
    let estado = encerrar(comMudancasFuturas(), 1, "2026-09");
    estado = encerrar(estado, 1, "2026-05");

    expect(valoresPorMes(estado, ["2026-04", "2026-05", "2026-08"])).toEqual([[10_000], [], []]);
  });

  it("encerrar no mês de início manda o recorrente inteiro para a lixeira, de onde volta intacto", () => {
    const estado = comMudancasFuturas();

    const encerrado = encerrar(estado, 1, "2026-01");

    expect(["2026-01", "2026-06", "2026-10", "2027-01"].flatMap((m) => projetarMes(encerrado, m as Mes).ocorrencias)).toEqual([]);
    expect(itensNaLixeira(encerrado).map((i) => [i.registro, i.id, i.apagadoEm])).toEqual([["lancamento", 1, HOJE]]);

    const restaurado = aplicarOk(encerrado, { tipo: "restaurar", registro: "lancamento", id: 1 });

    expect(restaurado).toEqual(estado);
  });

  it("encerrar fora dos meses em que o recorrente cai é recusado", () => {
    const estado = encerrar(comMudancasFuturas(), 1, "2026-09");

    expect(aplicar(estado, encerrarRecorrente(1, "2025-12"), HOJE).ok).toBe(false);
    expect(aplicar(estado, encerrarRecorrente(1, "2026-09"), HOJE).ok).toBe(false);
    expect(aplicar(estado, encerrarRecorrente(1, "2027-01"), HOJE).ok).toBe(false);
  });

  it("um recorrente na lixeira não pode ser mudado nem encerrado sem antes voltar", () => {
    const estado = aplicarOk(comMudancasFuturas(), { tipo: "apagar", registro: "lancamento", id: 1 });

    expect(aplicar(estado, mudarRecorrente(1, "2026-03", vigencia({})), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/lixeira/) });
    expect(aplicar(estado, encerrarRecorrente(1, "2026-03"), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/lixeira/) });
  });
});

describe("nascimento do mês com recorrente", () => {
  it("criar faz nascer só o mês de início; as ocorrências derivadas não fazem mês nascer", () => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-09-05" }));

    expect(nascidos(estado)).toEqual(["2026-09"]);
    expect(projetarMes(estado, "2026-10").ocorrencias).toHaveLength(1);
    expect(projetarMes(estado, "2026-10").orcamento.nascido).toBe(false);
  });

  it("mudar faz nascer o mês a partir do qual a mudança vale", () => {
    const estado = mudar(criar(estadoVazio(), recorrente({ data: "2026-09-05" })), 1, "2026-12", vigencia({ valor: 6_000 }));

    expect(nascidos(estado)).toEqual(["2026-09", "2026-12"]);
  });

  it("encerrar faz nascer o mês do encerramento", () => {
    const estado = encerrar(criar(estadoVazio(), recorrente({ data: "2026-09-05" })), 1, "2027-02");

    expect(nascidos(estado)).toEqual(["2026-09", "2027-02"]);
  });

  it("o mês que nasce herda do anterior no tempo mais recente", () => {
    let estado = criar(estadoVazio(), recorrente({ data: "2026-09-05" }));
    estado = aplicarOk(estado, { tipo: "salvar-percentuais", mes: "2026-10", percentuais: { ...estado.orcamentos["2026-09"]!, prazeres: 0 } });

    estado = mudar(estado, 1, "2026-12", vigencia({ valor: 6_000 }));

    expect(estado.orcamentos["2026-12"]).toEqual(estado.orcamentos["2026-10"]);
  });
});

describe("validação do recorrente", () => {
  it.each([
    ["criar", (e: Estado) => aplicar(e, criarRecorrente(recorrente({ valor: 0 })), HOJE)],
    ["mudar", (e: Estado) => aplicar(e, mudarRecorrente(1, "2026-10", vigencia({ valor: 0 })), HOJE)],
  ])("valor zero é recusado ao %s", (_, tentar) => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-09-05" }));

    expect(tentar(estado)).toEqual({ ok: false, erro: expect.stringMatching(/diferente de zero/) });
  });

  it.each([
    ["data inválida", { data: "2026-02-30" as Data }],
    ["sem descrição", { descricao: "  " }],
    ["pote que não existe", { pote: "lazer" as never }],
    ["tipo que não existe", { tipo: "cheque" as never }],
    ["valor fracionado", { valor: 10.5 }],
    ["tag que não é texto", { tag: 42 as never }],
  ])("%s é recusado", (_, campos) => {
    expect(aplicar(estadoVazio(), criarRecorrente(recorrente(campos)), HOJE).ok).toBe(false);
  });

  it("mudar com mês inválido é recusado", () => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-09-05" }));

    expect(aplicar(estado, mudarRecorrente(1, "2026-13" as Mes, vigencia({})), HOJE).ok).toBe(false);
  });

  it("um recorrente não vira compra: corrigi-lo como à vista ou parcelado é recusado", () => {
    const estado = criar(estadoVazio(), recorrente({ data: "2026-09-05" }));
    const comoCompra: Comando = {
      tipo: "salvar-lancamento",
      lancamento: { id: 1, data: "2026-09-05", descricao: "Netflix", pote: "prazeres", tipo: "cartao-de-credito", valor: 5_590, parcelas: 1 },
    };

    expect(aplicar(estado, comoCompra, HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/apague e lance de novo/) });
  });

  it("uma compra não vira recorrente: mudá-la ou encerrá-la como recorrente é recusado", () => {
    const estado = aplicarOk(estadoVazio(), {
      tipo: "salvar-lancamento",
      lancamento: { data: "2026-09-05", descricao: "Mercado", pote: "custos-fixos", tipo: "pix", valor: 30_000, parcelas: 1 },
    });

    expect(aplicar(estado, mudarRecorrente(1, "2026-09", vigencia({})), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/apague e lance de novo/) });
    expect(aplicar(estado, encerrarRecorrente(1, "2026-09"), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/apague e lance de novo/) });
  });

  it("mudar ou encerrar um recorrente que não existe é recusado", () => {
    expect(aplicar(estadoVazio(), mudarRecorrente(7, "2026-09", vigencia({})), HOJE).ok).toBe(false);
    expect(aplicar(estadoVazio(), encerrarRecorrente(7, "2026-09"), HOJE).ok).toBe(false);
  });

  it("o recorrente divide a numeração com as compras", () => {
    let estado = aplicarOk(estadoVazio(), {
      tipo: "salvar-lancamento",
      lancamento: { data: "2026-09-05", descricao: "Mercado", pote: "custos-fixos", tipo: "pix", valor: 30_000, parcelas: 1 },
    });
    estado = criar(estado, recorrente({ data: "2026-09-05" }));

    expect(projetarMes(estado, "2026-09").ocorrencias.map((o) => o.lancamento)).toEqual([1, 2]);
  });
});

describe("invariante dos eixos com recorrentes (propriedade)", () => {
  const EIXOS: Eixo[] = ["pote", "tipo", "tag"];
  const MESES: Mes[] = Array.from({ length: 12 }, (_, i) => somarMeses("2026-03", i));

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
  });

  /** Recorrentes cujas vigências mudam de pote e de tag, alguns encerrados, misturados a compras. */
  function estadoGerado(semente: number): Estado {
    const aleatorio = gerador(semente);
    const um = <T,>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)]!;
    const valor = () => (1 + Math.floor(aleatorio() * 300_000)) * (aleatorio() < 0.2 ? -1 : 1);
    const tag = () => (aleatorio() < 0.3 ? null : um(["transporte", "casa", "#Saúde"]));
    const campos = (): VigenciaASalvar => ({ descricao: "Algo", pote: um(POTES).id, tipo: um(TIPOS_DE_PAGAMENTO).id, valor: valor(), tag: tag() });
    const data = (): Data => {
      const mes = um(MESES);
      return `${mes}-${String(1 + Math.floor(aleatorio() * ultimoDiaDoMes(mes))).padStart(2, "0")}` as Data;
    };
    let estado = estadoVazio();
    for (let i = Math.floor(aleatorio() * 25); i > 0; i--) {
      const recorrentes = estado.lancamentos.filter((l): l is Recorrente => l.forma === "recorrente" && l.apagadoEm === null);
      const sorteio = aleatorio();
      const comando: Comando =
        sorteio < 0.3
          ? criarRecorrente({ ...campos(), data: data() })
          : sorteio < 0.6 && recorrentes.length > 0
            ? mudarRecorrente(um(recorrentes).id, um(MESES), campos())
            : sorteio < 0.7 && recorrentes.length > 0
              ? encerrarRecorrente(um(recorrentes).id, um(MESES))
              : { tipo: "salvar-lancamento", lancamento: { ...campos(), data: data(), tipo: "cartao-de-credito", parcelas: 1 + Math.floor(aleatorio() * 4) } };
      // Mudar ou encerrar fora dos meses em que o recorrente cai é recusado: o estado segue.
      const resultado = aplicar(estado, comando, HOJE);
      if (resultado.ok) estado = resultado.valor;
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

function datasPorMes(estado: Estado, meses: Mes[]): Data[] {
  return meses.map((m) => projetarMes(estado, m).ocorrencias[0]!.data);
}

const nascidos = (estado: Estado) => Object.keys(estado.orcamentos).sort();

function recorrenteDe(estado: Estado, id = 1): Recorrente {
  const l = estado.lancamentos.find((x) => x.id === id);
  if (l?.forma !== "recorrente") throw new Error(`${id} não é recorrente`);
  return l;
}

function recorrente(campos: Partial<RecorrenteACriar>): RecorrenteACriar {
  return { data: "2026-09-05", descricao: "Netflix", pote: "prazeres", tipo: "cartao-de-credito", valor: 5_590, ...campos };
}

function vigencia(campos: Partial<VigenciaASalvar>): VigenciaASalvar {
  return { descricao: "Netflix", pote: "prazeres", tipo: "cartao-de-credito", valor: 5_590, ...campos };
}

const criarRecorrente = (recorrente: RecorrenteACriar): Comando => ({ tipo: "criar-recorrente", recorrente });

const mudarRecorrente = (id: number, mes: Mes, vigencia: VigenciaASalvar): Comando => ({ tipo: "mudar-recorrente", id, mes, vigencia });

const encerrarRecorrente = (id: number, mes: Mes): Comando => ({ tipo: "encerrar-recorrente", id, mes });

const criar = (estado: Estado, r: RecorrenteACriar) => aplicarOk(estado, criarRecorrente(r));

const mudar = (estado: Estado, id: number, mes: Mes, v: VigenciaASalvar) => aplicarOk(estado, mudarRecorrente(id, mes, v));

const encerrar = (estado: Estado, id: number, mes: Mes) => aplicarOk(estado, encerrarRecorrente(id, mes));

function aplicarOk(estado: Estado, comando: Comando): Estado {
  const resultado = aplicar(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.valor;
}
