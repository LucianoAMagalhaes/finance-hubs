import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  trashItems,
  projectMonth,
  tagsInUse,
  type Command,
  type IsoDate,
  type IncomeToSave,
  type State,
  type ExpenseToSave,
  type Month,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

describe("lixeira", () => {
  it("apagar uma entrada tira a receita do mês; restaurar devolve exatamente a projeção de antes", () => {
    let estado = aplicarOk(emptyState(), salvarEntrada({ date: "2026-09-05", amount: 720_000 }));
    estado = aplicarOk(estado, salvarEntrada({ date: "2026-09-20", amount: 90_000 }));
    estado = aplicarOk(estado, salvarLancamento({ date: "2026-09-12", amount: 250_000 }));
    const antes = projectMonth(estado, "2026-09");

    const apagado = aplicarOk(estado, { type: "delete", record: "income", id: 1 });

    expect(projectMonth(apagado, "2026-09").monthIncome).toBe(90_000);
    expect(projectMonth(apagado, "2026-09").incomes.map((e) => e.id)).toEqual([2]);
    expect(projectMonth(apagado, "2026-09").jars.find((p) => p.id === "conforto")!.verdict).toBe("overrun");

    const restaurado = aplicarOk(apagado, { type: "restore", record: "income", id: 1 });

    expect(projectMonth(restaurado, "2026-09")).toEqual(antes);
    expect(restaurado).toEqual(estado);
  });

  it("apagar um parcelado tira todas as parcelas; restaurar devolve todas", () => {
    const meses: Month[] = ["2026-09", "2026-10", "2026-11"];
    const estado = aplicarOk(emptyState(), salvarLancamento({ date: "2026-09-12", amount: 100_000, installments: 3 }));
    const antes = meses.map((m) => projectMonth(estado, m));

    const apagado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    for (const m of meses) {
      expect(projectMonth(apagado, m).occurrences).toEqual([]);
      expect(projectMonth(apagado, m).aggregates.monthExpenses).toBe(0);
    }

    const restaurado = aplicarOk(apagado, { type: "restore", record: "expense", id: 1 });

    expect(meses.map((m) => projectMonth(restaurado, m))).toEqual(antes);
    expect(meses.map((m) => projectMonth(restaurado, m).occurrences.map((o) => o.amount))).toEqual([[33_334], [33_333], [33_333]]);
  });

  it("apagar tudo de um mês mantém o orçamento do mês com os seus percentuais", () => {
    let estado = aplicarOk(emptyState(), salvarEntrada({ date: "2026-09-05" }));
    estado = aplicarOk(estado, salvarLancamento({ date: "2026-09-12", amount: 42_050 }));
    const percentuais = { "custos-fixos": 40, "liberdade-financeira": 20, conforto: 15, metas: 10, conhecimento: 10, prazeres: 5 };
    estado = aplicarOk(estado, { type: "save-percentages", month: "2026-09", percentages: percentuais });

    estado = aplicarOk(estado, { type: "delete", record: "income", id: 1 });
    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    const vista = projectMonth(estado, "2026-09");
    expect(estado.budgets["2026-09"]).toEqual(percentuais);
    expect(vista.budget.born).toBe(true);
    expect(vista.jars.map((p) => p.percentage)).toEqual([40, 20, 15, 10, 10, 5]);
    expect(vista.monthIncome).toBe(0);
    expect(vista.jars.map((p) => p.verdict)).toEqual(Array(6).fill("no-income"));
  });

  it("a lixeira lista o que foi apagado, o mais recente primeiro, e restaurar tira de lá", () => {
    let estado = aplicarOk(emptyState(), salvarEntrada({ date: "2026-09-05" }));
    estado = aplicarOk(estado, salvarLancamento({ date: "2026-09-12", amount: 42_050 }));
    estado = aplicarOk(estado, salvarLancamento({ date: "2026-09-13", amount: 10_000 }));
    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 2 }, "2026-09-10");
    estado = aplicarOk(estado, { type: "delete", record: "income", id: 1 }, "2026-09-18");

    expect(trashItems(estado).map((i) => [i.record, i.id, i.deletedAt])).toEqual([
      ["income", 1, "2026-09-18"],
      ["expense", 2, "2026-09-10"],
    ]);

    estado = aplicarOk(estado, { type: "restore", record: "income", id: 1 });

    expect(trashItems(estado).map((i) => [i.record, i.id])).toEqual([["expense", 2]]);
  });

  it("a tag de um lançamento na lixeira deixa de estar em uso", () => {
    let estado = aplicarOk(emptyState(), salvarLancamento({ date: "2026-09-12", amount: 4_000, tag: "saúde" }));
    estado = aplicarOk(estado, salvarLancamento({ date: "2026-09-13", amount: 2_000, tag: "transporte" }));

    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    expect(tagsInUse(estado)).toEqual(["transporte"]);
  });

  it("não se apaga o que não existe ou já está na lixeira, nem se restaura o que não está", () => {
    let estado = aplicarOk(emptyState(), salvarEntrada({ date: "2026-09-05" }));

    expect(apply(estado, { type: "delete", record: "income", id: 9 }, HOJE).ok).toBe(false);
    expect(apply(estado, { type: "delete", record: "expense", id: 1 }, HOJE).ok).toBe(false);
    expect(apply(estado, { type: "restore", record: "income", id: 1 }, HOJE).ok).toBe(false);

    estado = aplicarOk(estado, { type: "delete", record: "income", id: 1 });

    expect(apply(estado, { type: "delete", record: "income", id: 1 }, HOJE).ok).toBe(false);
  });

  it("o comando chega do navegador: registro que não é um dos três é recusado", () => {
    const estado = aplicarOk(emptyState(), salvarLancamento({ date: "2026-09-12", amount: 42_050 }));

    const resultado = apply(estado, { type: "delete", record: "orcamento" as never, id: 1 }, HOJE);

    expect(resultado).toEqual({ ok: false, error: "Só entrada, lançamento ou antecipação vão para a lixeira." });
  });

  it("um item na lixeira não pode ser corrigido: volta primeiro, corrige depois", () => {
    let estado = aplicarOk(emptyState(), salvarLancamento({ date: "2026-09-12", amount: 42_050 }));
    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    const resultado = apply(estado, salvarLancamento({ id: 1, date: "2026-09-12", amount: 50_000 }), HOJE);

    expect(resultado.ok).toBe(false);
  });

  it("um registro novo não reaproveita o id de um que está na lixeira", () => {
    let estado = aplicarOk(emptyState(), salvarEntrada({ date: "2026-09-05" }));
    estado = aplicarOk(estado, { type: "delete", record: "income", id: 1 });

    estado = aplicarOk(estado, salvarEntrada({ date: "2026-09-06" }));

    expect(estado.incomes.map((e) => e.id)).toEqual([1, 2]);
  });

  it("apagar e restaurar não fazem mês nenhum nascer", () => {
    // Um estado anterior ao nascimento automático: o lançamento existe, o mês não nasceu.
    const estado: State = {
      ...emptyState(),
      expenses: [
        { id: 1, kind: "purchase", date: "2026-09-12", description: "Café", jar: "conforto", paymentMethod: "pix", amount: 1_000, installments: 1, tag: null, prepayments: [], deletedAt: null },
      ],
    };

    const apagado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });
    const restaurado = aplicarOk(apagado, { type: "restore", record: "expense", id: 1 });

    expect(apagado.budgets).toEqual({});
    expect(restaurado).toEqual(estado);
  });
});

function salvarEntrada(campos: Partial<IncomeToSave> & { date: IsoDate }): Command {
  return {
    type: "save-income",
    income: { description: "Salário", source: "salario", paymentMethod: "transferencia", amount: 720_000, ...campos },
  };
}

function salvarLancamento(campos: Partial<ExpenseToSave> & { date: IsoDate; amount: number }): Command {
  return {
    type: "save-expense",
    expense: { description: "Restaurante", jar: "conforto", paymentMethod: "cartao-de-credito", installments: 1, ...campos },
  };
}

function aplicarOk(estado: State, comando: Command, hoje: IsoDate = HOJE): State {
  const resultado = apply(estado, comando, hoje);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}
