import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  groups,
  trashItems,
  JARS,
  projectMonth,
  addMonths,
  tagsInUse,
  PAYMENT_METHODS,
  allExpenses,
  lastDayOfMonth,
  periodsWithEnd,
  type Command,
  type IsoDate,
  type Axis,
  type State,
  type Month,
  type Recurring,
  type RecurringToCreate,
  type PeriodToSave,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

describe("recorrente sem fim", () => {
  it("cai todo mês a partir do mês de início, no dia do recorrente, e em nenhum antes", () => {
    const estado = criar(emptyState(), recorrente({ date: "2026-09-05", amount: 5_590 }));

    expect(valoresPorMes(estado, ["2026-08", "2026-09", "2026-10", "2027-09", "2040-01"])).toEqual([[], [5_590], [5_590], [5_590], [5_590]]);
    expect(projectMonth(estado, "2031-03").occurrences[0]).toMatchObject({ date: "2031-03-05", description: "Netflix", jar: "pleasures" });
  });

  it("aparece num mês muito distante sem custo proporcional ao horizonte", () => {
    const estado = criar(emptyState(), recorrente({ date: "2026-09-05", amount: 5_590 }));
    const distante = "99999-12" as Month;

    const inicio = performance.now();
    for (let i = 0; i < 1_000; i++) projectMonth(estado, distante);
    const duracao = performance.now() - inicio;

    expect(projectMonth(estado, distante).occurrences.map((o) => [o.date, o.amount])).toEqual([["99999-12-05", 5_590]]);
    // Andar mês a mês até lá seriam ~1,2 milhão de passos por projeção.
    expect(duracao).toBeLessThan(1_000);
  });

  it("a ocorrência diz que é recorrente, desde quando, e desde quando vale a vigência", () => {
    let estado = criar(emptyState(), recorrente({ date: "2026-01-05", amount: 150_000 }));
    estado = mudar(estado, 1, "2026-07", vigencia({ amount: 165_000 }));

    expect(projectMonth(estado, "2026-09").occurrences[0]).toMatchObject({
      installment: null,
      recurring: { since: "2026-01", periodSince: "2026-07" },
    });
  });

  it("um reembolso recorrente devolve o mesmo valor todo mês ao pote", () => {
    const estado = criar(emptyState(), recorrente({ date: "2026-09-10", amount: -2_000 }));

    expect(valoresPorMes(estado, ["2026-09", "2026-12"])).toEqual([[-2_000], [-2_000]]);
    expect(projectMonth(estado, "2026-12").jars.find((p) => p.id === "pleasures")!.total).toBe(-2_000);
  });
});

describe("dia do recorrente", () => {
  it("o dia 31 cai no último dia dos meses mais curtos: 28 ou 29 em fevereiro", () => {
    const estado = criar(emptyState(), recorrente({ date: "2026-01-31" }));

    expect(datasPorMes(estado, ["2026-01", "2026-02", "2026-03", "2026-04", "2028-02"])).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2028-02-29",
    ]);
  });

  it("o dia é da recorrência: mudar num mês não muda o dia", () => {
    let estado = criar(emptyState(), recorrente({ date: "2026-01-31" }));
    estado = mudar(estado, 1, "2026-02", vigencia({ amount: 7_000 }));

    expect(datasPorMes(estado, ["2026-02", "2026-03"])).toEqual(["2026-02-28", "2026-03-31"]);
  });
});

describe("vigências", () => {
  /** Aluguel de R$ 1.500 desde janeiro, que muda para R$ 1.650 em julho. */
  function aluguel(): State {
    const estado = criar(emptyState(), recorrente({ date: "2026-01-05", description: "Aluguel", jar: "fixed-costs", amount: 150_000 }));
    return mudar(estado, 1, "2026-07", vigencia({ description: "Aluguel", jar: "fixed-costs", amount: 165_000 }));
  }

  it("mudar num mês vale dali para frente, e os meses anteriores não mudam", () => {
    expect(valoresPorMes(aluguel(), ["2026-01", "2026-06", "2026-07", "2027-03"])).toEqual([[150_000], [150_000], [165_000], [165_000]]);
  });

  it("corrigir março para R$ 1.550 vale até a próxima mudança: julho continua em R$ 1.650", () => {
    const estado = mudar(aluguel(), 1, "2026-03", vigencia({ description: "Aluguel", jar: "fixed-costs", amount: 155_000 }));

    expect(valoresPorMes(estado, ["2026-02", "2026-03", "2026-06", "2026-07", "2026-12"])).toEqual([
      [150_000],
      [155_000],
      [155_000],
      [165_000],
      [165_000],
    ]);
    expect(periodsWithEnd(recorrenteDe(estado)).map((v) => [v.since, v.until, v.amount])).toEqual([
      ["2026-01", "2026-02", 150_000],
      ["2026-03", "2026-06", 155_000],
      ["2026-07", null, 165_000],
    ]);
  });

  it("mudar de novo num mês que já começa uma vigência a substitui, sem criar outra", () => {
    const estado = mudar(aluguel(), 1, "2026-07", vigencia({ description: "Aluguel", jar: "fixed-costs", amount: 170_000 }));

    expect(valoresPorMes(estado, ["2026-06", "2026-07"])).toEqual([[150_000], [170_000]]);
    expect(periodsWithEnd(recorrenteDe(estado))).toHaveLength(2);
  });

  it("para corrigir desde o começo, abre-se o mês de início", () => {
    const estado = mudar(aluguel(), 1, "2026-01", vigencia({ description: "Aluguel do apê", jar: "fixed-costs", amount: 150_000 }));

    expect(projectMonth(estado, "2026-01").occurrences[0]!.description).toBe("Aluguel do apê");
    expect(projectMonth(estado, "2026-06").occurrences[0]!.description).toBe("Aluguel do apê");
    expect(projectMonth(estado, "2026-07").occurrences[0]!.description).toBe("Aluguel");
  });

  it("corrigir março para o valor de julho, e depois de novo, não engole julho", () => {
    let estado = mudar(aluguel(), 1, "2026-03", vigencia({ description: "Aluguel", jar: "fixed-costs", amount: 165_000 }));
    estado = mudar(estado, 1, "2026-03", vigencia({ description: "Aluguel", jar: "fixed-costs", amount: 155_000 }));

    expect(valoresPorMes(estado, ["2026-02", "2026-03", "2026-07"])).toEqual([[150_000], [155_000], [165_000]]);
  });

  it("valor, pote, tipo de pagamento, tag e descrição mudam numa vigência", () => {
    let estado = criar(emptyState(), recorrente({ date: "2026-01-10", jar: "pleasures", paymentMethod: "pix", tag: "streaming" }));
    estado = mudar(estado, 1, "2026-05", { description: "Curso", jar: "knowledge", paymentMethod: "boleto", amount: 20_000, tag: "#Estudo" });

    expect(projectMonth(estado, "2026-04").occurrences[0]).toMatchObject({ jar: "pleasures", paymentMethod: "pix", tag: "streaming" });
    expect(projectMonth(estado, "2026-05").occurrences[0]).toMatchObject({
      description: "Curso",
      jar: "knowledge",
      paymentMethod: "boleto",
      tag: "estudo",
      amount: 20_000,
    });
    expect(tagsInUse(estado)).toEqual(["estudo", "streaming"]);
  });

  it("mudar fora dos meses em que o recorrente cai é recusado", () => {
    const estado = encerrar(aluguel(), 1, "2026-10");

    expect(apply(estado, mudarRecorrente(1, "2025-12", vigencia({})), HOJE).ok).toBe(false);
    expect(apply(estado, mudarRecorrente(1, "2026-10", vigencia({})), HOJE).ok).toBe(false);
  });
});

describe("encerrar um recorrente", () => {
  /** Criado em janeiro, com mudanças em outubro e dezembro. */
  function comMudancasFuturas(): State {
    let estado = criar(emptyState(), recorrente({ date: "2026-01-05", amount: 10_000, tag: "casa" }));
    estado = mudar(estado, 1, "2026-10", vigencia({ amount: 11_000, tag: "reforma" }));
    return mudar(estado, 1, "2026-12", vigencia({ amount: 12_000, tag: "casa" }));
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

    expect(periodsWithEnd(recorrenteDe(estado)).map((v) => [v.since, v.until])).toEqual([["2026-01", "2026-08"]]);
    expect(tagsInUse(estado)).toEqual(["casa"]);
    expect(trashItems(estado)).toEqual([]);
  });

  it("encerrar no mês de uma vigência descarta ela e as seguintes, e mantém as anteriores", () => {
    const estado = encerrar(comMudancasFuturas(), 1, "2026-12");

    expect(valoresPorMes(estado, ["2026-09", "2026-11", "2026-12"])).toEqual([[10_000], [11_000], []]);
    expect(periodsWithEnd(recorrenteDe(estado)).map((v) => v.since)).toEqual(["2026-01", "2026-10"]);
  });

  it("encerrar de novo, antes, antecipa o fim", () => {
    let estado = encerrar(comMudancasFuturas(), 1, "2026-09");
    estado = encerrar(estado, 1, "2026-05");

    expect(valoresPorMes(estado, ["2026-04", "2026-05", "2026-08"])).toEqual([[10_000], [], []]);
  });

  it("encerrar no mês de início manda o recorrente inteiro para a lixeira, de onde volta intacto", () => {
    const estado = comMudancasFuturas();

    const encerrado = encerrar(estado, 1, "2026-01");

    expect(["2026-01", "2026-06", "2026-10", "2027-01"].flatMap((m) => projectMonth(encerrado, m as Month).occurrences)).toEqual([]);
    expect(trashItems(encerrado).map((i) => [i.record, i.id, i.deletedAt])).toEqual([["expense", 1, HOJE]]);

    const restaurado = aplicarOk(encerrado, { type: "restore", record: "expense", id: 1 });

    expect(restaurado).toEqual(estado);
  });

  it("encerrar fora dos meses em que o recorrente cai é recusado", () => {
    const estado = encerrar(comMudancasFuturas(), 1, "2026-09");

    expect(apply(estado, encerrarRecorrente(1, "2025-12"), HOJE).ok).toBe(false);
    expect(apply(estado, encerrarRecorrente(1, "2026-09"), HOJE).ok).toBe(false);
    expect(apply(estado, encerrarRecorrente(1, "2027-01"), HOJE).ok).toBe(false);
  });

  it("um recorrente na lixeira não pode ser mudado nem encerrado sem antes voltar", () => {
    const estado = aplicarOk(comMudancasFuturas(), { type: "delete", record: "expense", id: 1 });

    expect(apply(estado, mudarRecorrente(1, "2026-03", vigencia({})), HOJE)).toEqual({ ok: false, error: expect.stringMatching(/lixeira/) });
    expect(apply(estado, encerrarRecorrente(1, "2026-03"), HOJE)).toEqual({ ok: false, error: expect.stringMatching(/lixeira/) });
  });
});

describe("nascimento do mês com recorrente", () => {
  it("criar faz nascer só o mês de início; as ocorrências derivadas não fazem mês nascer", () => {
    const estado = criar(emptyState(), recorrente({ date: "2026-09-05" }));

    expect(nascidos(estado)).toEqual(["2026-09"]);
    expect(projectMonth(estado, "2026-10").occurrences).toHaveLength(1);
    expect(projectMonth(estado, "2026-10").budget.born).toBe(false);
  });

  it("mudar faz nascer o mês a partir do qual a mudança vale", () => {
    const estado = mudar(criar(emptyState(), recorrente({ date: "2026-09-05" })), 1, "2026-12", vigencia({ amount: 6_000 }));

    expect(nascidos(estado)).toEqual(["2026-09", "2026-12"]);
  });

  it("encerrar faz nascer o mês do encerramento", () => {
    const estado = encerrar(criar(emptyState(), recorrente({ date: "2026-09-05" })), 1, "2027-02");

    expect(nascidos(estado)).toEqual(["2026-09", "2027-02"]);
  });

  it("o mês que nasce herda do anterior no tempo mais recente", () => {
    let estado = criar(emptyState(), recorrente({ date: "2026-09-05" }));
    estado = aplicarOk(estado, { type: "save-percentages", month: "2026-10", percentages: { ...estado.budgets["2026-09"]!, pleasures: 0 } });

    estado = mudar(estado, 1, "2026-12", vigencia({ amount: 6_000 }));

    expect(estado.budgets["2026-12"]).toEqual(estado.budgets["2026-10"]);
  });
});

describe("validação do recorrente", () => {
  it.each([
    ["criar", (e: State) => apply(e, criarRecorrente(recorrente({ amount: 0 })), HOJE)],
    ["mudar", (e: State) => apply(e, mudarRecorrente(1, "2026-10", vigencia({ amount: 0 })), HOJE)],
  ])("valor zero é recusado ao %s", (_, tentar) => {
    const estado = criar(emptyState(), recorrente({ date: "2026-09-05" }));

    expect(tentar(estado)).toEqual({ ok: false, error: expect.stringMatching(/diferente de zero/) });
  });

  it.each([
    ["data inválida", { date: "2026-02-30" as IsoDate }],
    ["sem descrição", { description: "  " }],
    ["pote que não existe", { jar: "lazer" as never }],
    ["tipo que não existe", { paymentMethod: "cheque" as never }],
    ["valor fracionado", { amount: 10.5 }],
    ["tag que não é texto", { tag: 42 as never }],
  ])("%s é recusado", (_, campos) => {
    expect(apply(emptyState(), criarRecorrente(recorrente(campos)), HOJE).ok).toBe(false);
  });

  it("mudar com mês inválido é recusado", () => {
    const estado = criar(emptyState(), recorrente({ date: "2026-09-05" }));

    expect(apply(estado, mudarRecorrente(1, "2026-13" as Month, vigencia({})), HOJE).ok).toBe(false);
  });

  it("um recorrente não vira compra: corrigi-lo como à vista ou parcelado é recusado", () => {
    const estado = criar(emptyState(), recorrente({ date: "2026-09-05" }));
    const comoCompra: Command = {
      type: "save-expense",
      expense: { id: 1, date: "2026-09-05", description: "Netflix", jar: "pleasures", paymentMethod: "credit-card", amount: 5_590, installments: 1 },
    };

    expect(apply(estado, comoCompra, HOJE)).toEqual({ ok: false, error: expect.stringMatching(/apague e lance de novo/) });
  });

  it("uma compra não vira recorrente: mudá-la ou encerrá-la como recorrente é recusado", () => {
    const estado = aplicarOk(emptyState(), {
      type: "save-expense",
      expense: { date: "2026-09-05", description: "Mercado", jar: "fixed-costs", paymentMethod: "pix", amount: 30_000, installments: 1 },
    });

    expect(apply(estado, mudarRecorrente(1, "2026-09", vigencia({})), HOJE)).toEqual({ ok: false, error: expect.stringMatching(/apague e lance de novo/) });
    expect(apply(estado, encerrarRecorrente(1, "2026-09"), HOJE)).toEqual({ ok: false, error: expect.stringMatching(/apague e lance de novo/) });
  });

  it("mudar ou encerrar um recorrente que não existe é recusado", () => {
    expect(apply(emptyState(), mudarRecorrente(7, "2026-09", vigencia({})), HOJE).ok).toBe(false);
    expect(apply(emptyState(), encerrarRecorrente(7, "2026-09"), HOJE).ok).toBe(false);
  });

  it("o recorrente divide a numeração com as compras", () => {
    let estado = aplicarOk(emptyState(), {
      type: "save-expense",
      expense: { date: "2026-09-05", description: "Mercado", jar: "fixed-costs", paymentMethod: "pix", amount: 30_000, installments: 1 },
    });
    estado = criar(estado, recorrente({ date: "2026-09-05" }));

    expect(projectMonth(estado, "2026-09").occurrences.map((o) => o.expense)).toEqual([1, 2]);
  });
});

describe("invariante dos eixos com recorrentes (propriedade)", () => {
  const EIXOS: Axis[] = ["jar", "payment-method", "tag"];
  const MESES: Month[] = Array.from({ length: 12 }, (_, i) => addMonths("2026-03", i));

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("estado gerado com a semente %i", (semente) => {
    const estado = estadoGerado(semente);

    for (const mes of MESES) {
      const vista = projectMonth(estado, mes);
      expect(vista.jars.reduce((s, p) => s + p.total, 0)).toBe(vista.aggregates.monthExpenses);
      for (const eixo of EIXOS) {
        const gs = groups(vista, eixo);
        expect(gs.reduce((s, g) => s + g.total, 0), `eixo ${eixo} em ${mes}`).toBe(vista.aggregates.monthExpenses);
        expect(new Set(gs.flatMap((g) => g.occurrences))).toEqual(new Set(vista.occurrences));
        expect(gs.flatMap((g) => g.occurrences)).toHaveLength(vista.occurrences.length);
      }
      expect(allExpenses(vista).total).toBe(vista.aggregates.monthExpenses);
    }
  });

  /** Recorrentes cujas vigências mudam de pote e de tag, alguns encerrados, misturados a compras. */
  function estadoGerado(semente: number): State {
    const aleatorio = gerador(semente);
    const um = <T,>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)]!;
    const valor = () => (1 + Math.floor(aleatorio() * 300_000)) * (aleatorio() < 0.2 ? -1 : 1);
    const tag = () => (aleatorio() < 0.3 ? null : um(["transporte", "casa", "#Saúde"]));
    const campos = (): PeriodToSave => ({ description: "Algo", jar: um(JARS).id, paymentMethod: um(PAYMENT_METHODS).id, amount: valor(), tag: tag() });
    const data = (): IsoDate => {
      const mes = um(MESES);
      return `${mes}-${String(1 + Math.floor(aleatorio() * lastDayOfMonth(mes))).padStart(2, "0")}` as IsoDate;
    };
    let estado = emptyState();
    for (let i = Math.floor(aleatorio() * 25); i > 0; i--) {
      const recorrentes = estado.expenses.filter((l): l is Recurring => l.kind === "recurring" && l.deletedAt === null);
      const sorteio = aleatorio();
      const comando: Command =
        sorteio < 0.3
          ? criarRecorrente({ ...campos(), date: data() })
          : sorteio < 0.6 && recorrentes.length > 0
            ? mudarRecorrente(um(recorrentes).id, um(MESES), campos())
            : sorteio < 0.7 && recorrentes.length > 0
              ? encerrarRecorrente(um(recorrentes).id, um(MESES))
              : { type: "save-expense", expense: { ...campos(), date: data(), paymentMethod: "credit-card", installments: 1 + Math.floor(aleatorio() * 4) } };
      // Mudar ou encerrar fora dos meses em que o recorrente cai é recusado: o estado segue.
      const resultado = apply(estado, comando, HOJE);
      if (resultado.ok) estado = resultado.value;
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

function valoresPorMes(estado: State, meses: Month[]): number[][] {
  return meses.map((m) => projectMonth(estado, m).occurrences.map((o) => o.amount));
}

function datasPorMes(estado: State, meses: Month[]): IsoDate[] {
  return meses.map((m) => projectMonth(estado, m).occurrences[0]!.date);
}

const nascidos = (estado: State) => Object.keys(estado.budgets).sort();

function recorrenteDe(estado: State, id = 1): Recurring {
  const l = estado.expenses.find((x) => x.id === id);
  if (l?.kind !== "recurring") throw new Error(`${id} não é recorrente`);
  return l;
}

function recorrente(campos: Partial<RecurringToCreate>): RecurringToCreate {
  return { date: "2026-09-05", description: "Netflix", jar: "pleasures", paymentMethod: "credit-card", amount: 5_590, ...campos };
}

function vigencia(campos: Partial<PeriodToSave>): PeriodToSave {
  return { description: "Netflix", jar: "pleasures", paymentMethod: "credit-card", amount: 5_590, ...campos };
}

const criarRecorrente = (recorrente: RecurringToCreate): Command => ({ type: "create-recurring", recurring: recorrente });

const mudarRecorrente = (id: number, mes: Month, vigencia: PeriodToSave): Command => ({ type: "change-recurring", id, month: mes, period: vigencia });

const encerrarRecorrente = (id: number, mes: Month): Command => ({ type: "end-recurring", id, month: mes });

const criar = (estado: State, r: RecurringToCreate) => aplicarOk(estado, criarRecorrente(r));

const mudar = (estado: State, id: number, mes: Month, v: PeriodToSave) => aplicarOk(estado, mudarRecorrente(id, mes, v));

const encerrar = (estado: State, id: number, mes: Month) => aplicarOk(estado, encerrarRecorrente(id, mes));

function aplicarOk(estado: State, comando: Command): State {
  const resultado = apply(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}
