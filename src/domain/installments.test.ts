import { describe, expect, it } from "vitest";
import {
  apply,
  splitIntoInstallments,
  emptyState,
  groups,
  JARS,
  projectMonth,
  addMonths,
  PAYMENT_METHODS,
  allExpenses,
  lastDayOfMonth,
  type Command,
  type Purchase,
  type IsoDate,
  type Axis,
  type State,
  type ExpenseToSave,
  type Month,
  type NewExpense,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

describe("parcelas de um parcelado", () => {
  it("R$ 1.000 em 3× são 333,34 + 333,33 + 333,33 a partir do mês da compra, e nada fora deles", () => {
    const estado = salvar(emptyState(), parcelado({ date: "2026-09-12", amount: 100_000, installments: 3 }));

    expect(valoresPorMes(estado, ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"])).toEqual([[], [33_334], [33_333], [33_333], []]);
  });

  it("a ocorrência diz qual parcela é, de quantas, e de que total", () => {
    const estado = salvar(emptyState(), parcelado({ date: "2026-06-18", amount: 389_900, installments: 10 }));

    const [ocorrencia] = projectMonth(estado, "2026-09").occurrences;

    expect(ocorrencia).toMatchObject({ amount: 38_990, installment: { number: 4, of: 10, total: 389_900 } });
  });

  it("o à vista não é parcela", () => {
    const estado = salvar(emptyState(), parcelado({ installments: 1 }));

    expect(projectMonth(estado, "2026-09").occurrences[0]!.installment).toBeNull();
  });

  it("a parcela cai no dia da compra, limitado ao último dia do mês", () => {
    const estado = salvar(emptyState(), parcelado({ date: "2026-01-31", installments: 3 }));

    expect(projectMonth(estado, "2026-02").occurrences[0]!.date).toBe("2026-02-28");
    expect(projectMonth(estado, "2026-03").occurrences[0]!.date).toBe("2026-03-31");
  });

  it("um parcelado que começou antes do app, lançado com a data original, só tem as restantes daqui para frente", () => {
    const estado = salvar(emptyState(), parcelado({ date: "2026-03-10", amount: 120_000, installments: 10 }));

    expect(projectMonth(estado, "2026-09").occurrences[0]!.installment).toMatchObject({ number: 7 });
    expect(projectMonth(estado, "2026-12").occurrences[0]!.installment).toMatchObject({ number: 10 });
    expect(projectMonth(estado, "2027-01").occurrences).toEqual([]);
  });

  it("um reembolso parcelado divide o total negativo do mesmo jeito", () => {
    const estado = salvar(emptyState(), parcelado({ amount: -100_000, installments: 3 }));

    expect(valoresPorMes(estado, ["2026-09", "2026-10", "2026-11"])).toEqual([[-33_334], [-33_333], [-33_333]]);
  });

  it("as parcelas sempre somam o total, e o centavo que sobra fica na primeira", () => {
    for (const [total, n] of [[100_000, 3], [1, 2], [-1, 2], [99_999, 7], [-389_900, 10], [5, 12], [42_000, 1]] as const) {
      const { first: primeira, rest: demais } = splitIntoInstallments(total, n);
      expect(primeira + demais * (n - 1), `${total} em ${n}×`).toBe(total);
      expect(Math.sign(primeira)).toBe(Math.sign(total));
      expect(Math.abs(primeira - demais)).toBeLessThan(n);
    }
  });
});

describe("validação do parcelado", () => {
  it.each(PAYMENT_METHODS.filter((t) => t.id !== "credit-card").map((t) => t.id))(
    "mais de uma parcela em %s é recusado",
    (tipo) => {
      expect(apply(emptyState(), salvarLancamento(parcelado({ paymentMethod: tipo, installments: 3 })), HOJE)).toEqual({
        ok: false,
        error: expect.stringMatching(/Cartão de Crédito/),
      });
    },
  );

  it.each([
    ["zero parcelas", 0],
    ["parcelas negativas", -2],
    ["parcelas fracionadas", 2.5],
    ["parcelas que não são número", "3" as never],
  ])("%s é recusado", (_, parcelas) => {
    expect(apply(emptyState(), salvarLancamento(parcelado({ installments: parcelas })), HOJE).ok).toBe(false);
  });
});

describe("corrigir um parcelado", () => {
  it("corrigir o total muda todas as parcelas, inclusive as de meses passados", () => {
    const estado = salvar(emptyState(), parcelado({ date: "2026-07-05", amount: 90_000, installments: 3 }));
    const id = projectMonth(estado, "2026-07").occurrences[0]!.expense;

    const corrigido = salvar(estado, { ...parcelado({ date: "2026-07-05", amount: 120_000, installments: 3 }), id });

    expect(valoresPorMes(corrigido, ["2026-07", "2026-08", "2026-09"])).toEqual([[40_000], [40_000], [40_000]]);
  });

  it("trocar para à vista deixa uma ocorrência só, com o total, no mês da compra", () => {
    const estado = salvar(emptyState(), parcelado({ date: "2026-07-05", amount: 90_000, installments: 3 }));
    const id = projectMonth(estado, "2026-07").occurrences[0]!.expense;

    const aVista = salvar(estado, { ...parcelado({ date: "2026-07-05", amount: 90_000, installments: 1 }), id });

    expect(valoresPorMes(aVista, ["2026-07", "2026-08", "2026-09"])).toEqual([[90_000], [], []]);
  });

  it("trocar de à vista para parcelado espalha o total pelos meses", () => {
    const estado = salvar(emptyState(), parcelado({ amount: 60_000, installments: 1 }));
    const id = projectMonth(estado, "2026-09").occurrences[0]!.expense;

    const emParcelas = salvar(estado, { ...parcelado({ amount: 60_000, installments: 2 }), id });

    expect(valoresPorMes(emParcelas, ["2026-09", "2026-10"])).toEqual([[30_000], [30_000]]);
  });
});

describe("nascimento do mês com parcelado", () => {
  it("só o mês da compra nasce: a 4ª parcela caindo em dezembro não faz dezembro nascer", () => {
    const estado = salvar(emptyState(), parcelado({ date: "2026-09-12", installments: 4 }));

    expect(projectMonth(estado, "2026-09").budget.born).toBe(true);
    for (const mes of ["2026-10", "2026-11", "2026-12"] as const) {
      expect(projectMonth(estado, mes).occurrences, mes).toHaveLength(1);
      expect(projectMonth(estado, mes).budget.born, mes).toBe(false);
    }
  });
});

describe("invariante dos eixos com parcelados (propriedade)", () => {
  const EIXOS: Axis[] = ["jar", "payment-method", "tag"];
  const MESES: Month[] = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];

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
    // Somadas em todos os meses, as parcelas de cada compra dão o seu total.
    for (const l of estado.expenses) {
      // A última parcela possível: 12× a partir de dezembro cai em novembro do ano seguinte.
      const soma = Array.from({ length: 17 }, (_, i) => addMonths("2026-07", i))
        .flatMap((m) => projectMonth(estado, m).occurrences)
        .filter((o) => o.expense === l.id)
        .reduce((s, o) => s + o.amount, 0);
      expect(soma).toBe((l as Purchase).amount);
    }
  });

  /** Compras à vista e parceladas, reembolsos e correções de forma, espalhadas por meses. */
  function estadoGerado(semente: number): State {
    const aleatorio = gerador(semente);
    const um = <T,>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)]!;
    const data = (): IsoDate => {
      const mes = um(MESES);
      return `${mes}-${String(1 + Math.floor(aleatorio() * lastDayOfMonth(mes))).padStart(2, "0")}` as IsoDate;
    };
    let estado = emptyState();
    for (let i = Math.floor(aleatorio() * 20); i > 0; i--) {
      const valor = 1 + Math.floor(aleatorio() * 500_000);
      const parcelas = aleatorio() < 0.5 ? 1 : 2 + Math.floor(aleatorio() * 11);
      const corrigir = estado.expenses.length > 0 && aleatorio() < 0.2;
      const dados = parcelado({
        ...(corrigir && { id: um(estado.expenses).id }),
        date: data(),
        jar: um(JARS).id,
        paymentMethod: parcelas > 1 ? "credit-card" : um(PAYMENT_METHODS).id,
        amount: aleatorio() < 0.25 ? -valor : valor,
        installments: parcelas,
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

function valoresPorMes(estado: State, meses: Month[]): number[][] {
  return meses.map((m) => projectMonth(estado, m).occurrences.map((o) => o.amount));
}

function parcelado(campos: Partial<NewExpense> & { id?: number }): ExpenseToSave {
  return {
    date: "2026-09-12",
    description: "Notebook",
    jar: "comfort",
    paymentMethod: "credit-card",
    amount: 100_000,
    installments: 3,
    ...campos,
  };
}

function salvarLancamento(lancamento: ExpenseToSave): Command {
  return { type: "save-expense", expense: lancamento };
}

function salvar(estado: State, lancamento: ExpenseToSave): State {
  const resultado = apply(estado, salvarLancamento(lancamento), HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}
