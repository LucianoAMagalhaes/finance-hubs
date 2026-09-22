import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  groups,
  trashItems,
  expensesWithTag,
  tagHue,
  projectMonth,
  tagsInUse,
  periodsWithEnd,
  type Command,
  type Purchase,
  type IsoDate,
  type State,
  type ExpenseToSave,
  type Month,
  type Jar,
  type Recurring,
  type PeriodToSave,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

/**
 * `#transporte` no combustível de janeiro, num parcelado que atravessa o ano, e
 * num recorrente cuja segunda vigência a mantém; `#casa` à parte, para ver que
 * renomear não a toca.
 */
function historico(): State {
  let estado = salvar(emptyState(), gasto({ date: "2026-01-10", description: "Combustível", tag: "transporte", amount: 30_000 }));
  estado = salvar(estado, gasto({ date: "2026-02-05", description: "Pneus", tag: "#Transporte", amount: 120_000, installments: 12 }));
  estado = salvar(estado, gasto({ date: "2026-03-01", description: "Faxina", tag: "casa", amount: 20_000 }));
  estado = criar(estado, { date: "2026-01-15", description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 25_000, tag: "transporte" });
  return mudar(estado, 4, "2026-06", { description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 28_000, tag: "transporte" });
}

describe("renomear uma tag", () => {
  it("troca o nome nas compras e nas vigências de recorrentes, em meses passados e futuros", () => {
    const estado = renomear(historico(), "transporte", "#Mobilidade");

    expect(tagsInUse(estado)).toEqual(["casa", "mobilidade"]);
    expect(estado.expenses.map((l) => (l.kind === "purchase" ? l.tag : l.periods.map((v) => v.tag)))).toEqual([
      "mobilidade",
      "mobilidade",
      "casa",
      ["mobilidade", "mobilidade"],
    ]);
    for (const mes of ["2026-01", "2026-02", "2026-06", "2026-12", "2028-01"] as const) {
      expect(projectMonth(estado, mes).occurrences.map((o) => o.tag), mes).not.toContain("transporte");
    }
    expect(projectMonth(estado, "2026-01").occurrences.map((o) => o.tag)).toEqual(["mobilidade", "mobilidade"]);
  });

  it("o nome novo passa pela mesma normalização da tag", () => {
    const estado = renomear(historico(), "transporte", " # Ida e Volta ");

    expect(tagsInUse(estado)).toEqual(["casa", "ida-e-volta"]);
  });

  it("nada mais do lançamento muda: só a tag", () => {
    const antes = historico();

    const depois = renomear(antes, "transporte", "mobilidade");

    expect(depois.budgets).toEqual(antes.budgets);
    expect(depois.incomes).toEqual(antes.incomes);
    expect(depois.expenses.map((l) => ({ ...l, tag: null, periods: undefined }))).toEqual(
      antes.expenses.map((l) => ({ ...l, tag: null, periods: undefined })),
    );
  });

  it("renomear não faz mês nenhum nascer: a tag não tem mês", () => {
    const antes = criar(emptyState(), { date: "2026-01-15", description: "Estacionamento", jar: "fixed-costs", paymentMethod: "pix", amount: 25_000, tag: "transporte" });

    const depois = renomear(antes, "transporte", "mobilidade");

    expect(Object.keys(depois.budgets)).toEqual(["2026-01"]);
  });

  it("a cor acompanha o nome novo, porque é derivada dele", () => {
    const estado = renomear(historico(), "transporte", "mobilidade");

    expect(tagHue(groups(projectMonth(estado, "2026-01"), "tag")[0]!.key!)).toBe(tagHue("mobilidade"));
  });

  it("um lançamento na lixeira também é renomeado, para não ressuscitar o nome antigo", () => {
    let estado = salvar(emptyState(), gasto({ tag: "transporte" }));
    estado = salvar(estado, gasto({ date: "2026-09-13", tag: "transporte" }));
    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 2 });

    estado = renomear(estado, "transporte", "mobilidade");

    expect(estado.expenses.map((l) => (l as Purchase).tag)).toEqual(["mobilidade", "mobilidade"]);
    expect(trashItems(estado)).toHaveLength(1);

    const restaurado = aplicarOk(estado, { type: "restore", record: "expense", id: 2 });

    expect(tagsInUse(restaurado)).toEqual(["mobilidade"]);
  });
});

describe("quantos lançamentos usam a tag", () => {
  it("conta os lançamentos vivos, com o recorrente uma vez só, e ignora a lixeira", () => {
    let estado = historico();

    expect(expensesWithTag(estado, "transporte")).toBe(3);
    expect(expensesWithTag(estado, "casa")).toBe(1);
    expect(expensesWithTag(estado, "uber")).toBe(0);

    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    expect(expensesWithTag(estado, "transporte")).toBe(2);
  });
});

describe("fundir duas tags", () => {
  /** `#transporte` em janeiro e `#uber` em fevereiro, dois gastos cada. */
  function duasTags(): State {
    let estado = salvar(emptyState(), gasto({ date: "2026-01-10", tag: "transporte", amount: 30_000 }));
    estado = salvar(estado, gasto({ date: "2026-01-20", tag: "transporte", amount: 10_000 }));
    estado = salvar(estado, gasto({ date: "2026-01-25", tag: "uber", amount: 5_000 }));
    return salvar(estado, gasto({ date: "2026-02-03", tag: "uber", amount: 7_000 }));
  }

  it("renomear para um nome que já existe, sem confirmação, é recusado e não muda nada", () => {
    const antes = duasTags();

    const recusa = apply(antes, renomearTag("transporte", "uber", false), HOJE);

    expect(recusa).toEqual({ ok: false, error: expect.stringMatching(/#uber/) });
    expect(apply(antes, { type: "rename-tag", from: "transporte", to: "uber" } as Command, HOJE).ok).toBe(false);
  });

  it("com a confirmação, as duas viram uma só e os totais do grupo somam", () => {
    const estado = aplicarOk(duasTags(), renomearTag("transporte", "uber", true));

    expect(tagsInUse(estado)).toEqual(["uber"]);
    const janeiro = groups(projectMonth(estado, "2026-01"), "tag");
    expect(janeiro.map((g) => [g.key, g.total])).toEqual([["uber", 45_000]]);
    expect(janeiro[0]!.occurrences).toHaveLength(3);
    expect(groups(projectMonth(estado, "2026-02"), "tag").map((g) => [g.key, g.total])).toEqual([["uber", 7_000]]);
  });

  it("a fusão também junta as vigências de um recorrente", () => {
    let estado = criar(emptyState(), { date: "2026-01-15", description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 25_000, tag: "transporte" });
    estado = mudar(estado, 1, "2026-06", { description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 28_000, tag: "uber" });

    estado = aplicarOk(estado, renomearTag("transporte", "uber", true));

    expect(periodsWithEnd(estado.expenses[0] as Recurring).map((v) => v.tag)).toEqual(["uber", "uber"]);
    expect(tagsInUse(estado)).toEqual(["uber"]);
  });

  it("um nome que só dorme na lixeira também pede confirmação: ele volta ao restaurar", () => {
    let estado = salvar(emptyState(), gasto({ tag: "transporte" }));
    estado = salvar(estado, gasto({ date: "2026-09-13", tag: "uber" }));
    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 2 });

    expect(tagsInUse(estado)).toEqual(["transporte"]);
    expect(apply(estado, renomearTag("transporte", "uber", false), HOJE).ok).toBe(false);

    const fundido = aplicarOk(estado, renomearTag("transporte", "uber", true));
    const restaurado = aplicarOk(fundido, { type: "restore", record: "expense", id: 2 });

    expect(tagsInUse(restaurado)).toEqual(["uber"]);
  });

  it("confirmar a fusão sem que o nome novo exista renomeia como sempre", () => {
    const estado = aplicarOk(duasTags(), renomearTag("transporte", "mobilidade", true));

    expect(tagsInUse(estado)).toEqual(["mobilidade", "uber"]);
  });
});

describe("validação do renomear", () => {
  it("renomear uma tag que ninguém usa é recusado", () => {
    const estado = salvar(emptyState(), gasto({ tag: "casa" }));

    expect(apply(estado, renomearTag("transporte", "mobilidade", false), HOJE).ok).toBe(false);
  });

  it("uma tag que só existe na lixeira já não está em uso: renomeá-la é recusado", () => {
    let estado = salvar(emptyState(), gasto({ tag: "transporte" }));
    estado = aplicarOk(estado, { type: "delete", record: "expense", id: 1 });

    expect(apply(estado, renomearTag("transporte", "mobilidade", false), HOJE).ok).toBe(false);
  });

  it("um nome novo que não sobra depois de normalizado é recusado", () => {
    const estado = salvar(emptyState(), gasto({ tag: "transporte" }));

    for (const para of ["", "   ", " # "]) {
      expect(apply(estado, renomearTag("transporte", para, false), HOJE).ok, para).toBe(false);
    }
  });

  it("renomear para o mesmo nome é recusado, ainda que digitado de outro jeito", () => {
    const estado = salvar(emptyState(), gasto({ tag: "transporte" }));

    expect(apply(estado, renomearTag("transporte", "#Transporte", false), HOJE)).toEqual({
      ok: false,
      error: expect.stringMatching(/já é o nome/),
    });
  });

  it("o nome de origem também passa pela normalização: vem da tela como foi clicado", () => {
    const estado = salvar(emptyState(), gasto({ tag: "transporte" }));

    expect(tagsInUse(aplicarOk(estado, renomearTag("#Transporte", "mobilidade", false)))).toEqual(["mobilidade"]);
  });

  it.each([
    ["de que não é texto", 42 as never, "mobilidade"],
    ["para que não é texto", "transporte", 42 as never],
  ])("%s é recusado", (_, de, para) => {
    const estado = salvar(emptyState(), gasto({ tag: "transporte" }));

    expect(apply(estado, renomearTag(de, para, false), HOJE).ok).toBe(false);
  });
});

function gasto(campos: {
  date?: IsoDate;
  description?: string;
  jar?: Jar;
  amount?: number;
  installments?: number;
  tag?: string | null;
}): ExpenseToSave {
  return { date: "2026-09-12", description: "Mercado", jar: "fixed-costs", paymentMethod: "credit-card", amount: 10_000, installments: 1, ...campos };
}

const renomearTag = (de: string, para: string, fundir: boolean): Command => ({ type: "rename-tag", from: de, to: para, merge: fundir });

const renomear = (estado: State, de: string, para: string) => aplicarOk(estado, renomearTag(de, para, false));

const salvar = (estado: State, lancamento: ExpenseToSave) => aplicarOk(estado, { type: "save-expense", expense: lancamento });

const criar = (estado: State, recorrente: PeriodToSave & { date: IsoDate }) => aplicarOk(estado, { type: "create-recurring", recurring: recorrente });

const mudar = (estado: State, id: number, mes: Month, vigencia: PeriodToSave) =>
  aplicarOk(estado, { type: "change-recurring", id, month: mes, period: vigencia });

function aplicarOk(estado: State, comando: Command): State {
  const resultado = apply(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}
