import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  groups,
  tagHue,
  normalizeTag,
  JARS,
  projectMonth,
  tagsInUse,
  allExpenses,
  PAYMENT_METHODS,
  type Command,
  type Purchase,
  type IsoDate,
  type Axis,
  type State,
  type ExpenseToSave,
  type Month,
  type Jar,
  type PaymentMethod,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

describe("tag do lançamento", () => {
  it("\"#Saúde Mental\" e \"saúde-mental\" viram a mesma tag", () => {
    let estado = salvar(emptyState(), gasto({ tag: "#Saúde Mental", amount: 10_000 }));
    estado = salvar(estado, gasto({ tag: "saúde-mental", amount: 5_000 }));

    const tags = groups(projectMonth(estado, "2026-09"), "tag");

    expect(tags.map((g) => [g.name, g.total])).toEqual([["#saúde-mental", 15_000]]);
    expect(estado.expenses.map((l) => (l as Purchase).tag)).toEqual(["saúde-mental", "saúde-mental"]);
  });

  it.each([
    ["  Transporte ", "transporte"],
    ["##Uber", "uber"],
    ["# casa  nova ", "casa-nova"],
    ["SAÚDE", "saúde"],
    ["sau\u0301de", "saúde"],
  ])("%j é gravada como %j", (digitada, gravada) => {
    const estado = salvar(emptyState(), gasto({ tag: digitada }));

    expect(estado.expenses[0]).toMatchObject({ tag: gravada });
  });

  it("acento é preservado: \"saude\" e \"saúde\" são tags diferentes", () => {
    let estado = salvar(emptyState(), gasto({ tag: "saude" }));
    estado = salvar(estado, gasto({ tag: "saúde" }));

    expect(groups(projectMonth(estado, "2026-09"), "tag").map((g) => g.name)).toEqual(["#saude", "#saúde"]);
  });

  it.each([["sem tag", undefined], ["tag vazia", ""], ["só espaços", "   "], ["só \"#\"", " # "], ["null", null]])(
    "%s grava o lançamento sem tag",
    (_, tag) => {
      const estado = salvar(emptyState(), gasto({ tag }));

      expect(estado.expenses[0]).toMatchObject({ tag: null });
    },
  );

  it("tag que não é texto é recusada", () => {
    expect(apply(emptyState(), salvarLancamento(gasto({ tag: 42 as never })), HOJE).ok).toBe(false);
  });

  it("corrigir o lançamento pode trocar ou tirar a tag", () => {
    const estado = salvar(emptyState(), gasto({ tag: "uber" }));
    const id = estado.expenses[0]!.id;

    expect(salvar(estado, { ...gasto({ tag: "Transporte" }), id }).expenses[0]).toMatchObject({ tag: "transporte" });
    expect(salvar(estado, { ...gasto({ tag: "" }), id }).expenses[0]).toMatchObject({ tag: null });
  });

  it("a ocorrência leva a tag do lançamento", () => {
    const estado = salvar(emptyState(), gasto({ tag: "casa" }));

    expect(projectMonth(estado, "2026-09").occurrences[0]!.tag).toBe("casa");
  });

  it("as tags em uso são as dos lançamentos, sem repetir, em ordem alfabética", () => {
    let estado = salvar(emptyState(), gasto({ tag: "uber" }));
    estado = salvar(estado, gasto({ tag: "casa", date: "2027-01-10" }));
    estado = salvar(estado, gasto({ tag: "Uber" }));
    estado = salvar(estado, gasto({}));

    expect(tagsInUse(estado)).toEqual(["casa", "uber"]);
  });

  it("normalizarTag é a mesma regra que o comando aplica", () => {
    expect(normalizeTag("#Saúde Mental")).toBe("saúde-mental");
    expect(normalizeTag(" # ")).toBeNull();
  });

  it("a cor da tag é um de oito matizes, derivado só do nome", () => {
    const matizes = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "transporte", "casa"].map(tagHue));

    expect(tagHue("transporte")).toBe(tagHue("transporte"));
    expect(matizes.size).toBeGreaterThan(1);
    expect(matizes.size).toBeLessThanOrEqual(8);
  });
});

describe("grupos de um eixo", () => {
  it("no eixo pote, os seis potes em ordem, com o total de cada um", () => {
    const estado = salvar(emptyState(), gasto({ jar: "comfort", amount: 42_000 }));

    const potes = groups(projectMonth(estado, "2026-09"), "jar");

    expect(potes.map((g) => g.key)).toEqual(JARS.map((p) => p.id));
    expect(potes.find((g) => g.key === "comfort")).toMatchObject({ name: "Conforto", total: 42_000 });
  });

  it("o grupo \"sem tag\" existe quando há ocorrência sem tag, e vem por último", () => {
    let estado = salvar(emptyState(), gasto({ tag: "uber", amount: 3_000 }));
    estado = salvar(estado, gasto({ amount: 7_000 }));
    estado = salvar(estado, gasto({ tag: "casa", amount: 1_000 }));

    const tags = groups(projectMonth(estado, "2026-09"), "tag");

    expect(tags.map((g) => [g.key, g.name, g.total])).toEqual([
      ["casa", "#casa", 1_000],
      ["uber", "#uber", 3_000],
      [null, "sem tag", 7_000],
    ]);
  });

  it("sem ocorrência sem tag, não há grupo \"sem tag\"", () => {
    const estado = salvar(emptyState(), gasto({ tag: "uber" }));

    expect(groups(projectMonth(estado, "2026-09"), "tag").map((g) => g.key)).toEqual(["uber"]);
  });

  it("no eixo tipo, só os tipos usados no mês, na ordem da lista", () => {
    let estado = salvar(emptyState(), gasto({ paymentMethod: "pix" }));
    estado = salvar(estado, gasto({ paymentMethod: "cash" }));
    estado = salvar(estado, gasto({ paymentMethod: "boleto", date: "2026-10-05" }));

    expect(groups(projectMonth(estado, "2026-09"), "payment-method").map((g) => g.name)).toEqual(["Dinheiro", "PIX"]);
  });

  it("um grupo de tipo de pagamento pode ficar negativo: só reembolso", () => {
    let estado = salvar(emptyState(), gasto({ paymentMethod: "credit-card", amount: 50_000 }));
    estado = salvar(estado, gasto({ paymentMethod: "pix", amount: -29_790 }));

    const pix = groups(projectMonth(estado, "2026-09"), "payment-method").find((g) => g.key === "pix")!;

    expect(pix.total).toBe(-29_790);
    expect(pix.occurrences).toHaveLength(1);
  });

  it("as ocorrências de um grupo vêm em ordem de data", () => {
    let estado = salvar(emptyState(), gasto({ date: "2026-09-20", description: "Farmácia", tag: "saúde" }));
    estado = salvar(estado, gasto({ date: "2026-09-03", description: "Consulta", tag: "saúde" }));

    const saude = groups(projectMonth(estado, "2026-09"), "tag")[0]!;

    expect(saude.occurrences.map((o) => o.description)).toEqual(["Consulta", "Farmácia"]);
  });

  it("\"Todos os gastos do mês\" tem todas as ocorrências e soma as despesas", () => {
    let estado = salvar(emptyState(), gasto({ amount: 50_000 }));
    estado = salvar(estado, gasto({ amount: -1_000, tag: "casa" }));
    estado = salvar(estado, gasto({ date: "2026-10-01" }));
    const vista = projectMonth(estado, "2026-09");

    const todos = allExpenses(vista);

    expect(todos.name).toBe("Todos os gastos do mês");
    expect(todos.total).toBe(49_000);
    expect(todos.occurrences).toEqual(vista.occurrences);
  });
});

describe("invariante dos eixos (propriedade)", () => {
  const EIXOS: Axis[] = ["jar", "payment-method", "tag"];
  const MESES: Month[] = ["2026-08", "2026-09", "2026-10"];

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("estado gerado com a semente %i", (semente) => {
    const estado = estadoGerado(semente);

    for (const mes of MESES) {
      const vista = projectMonth(estado, mes);
      const somaDosPotes = vista.jars.reduce((s, p) => s + p.total, 0);
      expect(somaDosPotes).toBe(vista.aggregates.monthExpenses);

      for (const eixo of EIXOS) {
        const gs = groups(vista, eixo);
        expect(gs.reduce((s, g) => s + g.total, 0), `eixo ${eixo} em ${mes}`).toBe(vista.aggregates.monthExpenses);
        // Cada ocorrência cai em exatamente um grupo do eixo.
        const vistas = gs.flatMap((g) => g.occurrences);
        expect(vistas).toHaveLength(vista.occurrences.length);
        expect(new Set(vistas)).toEqual(new Set(vista.occurrences));
        for (const g of gs) expect(g.total).toBe(g.occurrences.reduce((s, o) => s + o.amount, 0));
      }
      expect(allExpenses(vista).total).toBe(vista.aggregates.monthExpenses);
    }
  });

  /** Entradas, gastos e reembolsos, com e sem tag, espalhados por três meses, todos por comando. */
  function estadoGerado(semente: number): State {
    const aleatorio = gerador(semente);
    const um = <T,>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)]!;
    const data = (): IsoDate => `${um(MESES)}-${String(1 + Math.floor(aleatorio() * 28)).padStart(2, "0")}` as IsoDate;
    const TAGS = ["#Transporte", "transporte", "Saúde Mental", "saude", "casa", "", "  "];
    const comandos: Command[] = [];
    for (let i = Math.floor(aleatorio() * 4); i > 0; i--) {
      comandos.push({
        type: "save-income",
        income: { date: data(), description: "Salário", source: "salary", paymentMethod: "pix", amount: 1 + Math.floor(aleatorio() * 1_000_000) },
      });
    }
    for (let i = Math.floor(aleatorio() * 25); i > 0; i--) {
      const valor = 1 + Math.floor(aleatorio() * 200_000);
      comandos.push(
        salvarLancamento(
          gasto({
            date: data(),
            jar: um(JARS).id,
            paymentMethod: um(PAYMENT_METHODS).id,
            amount: aleatorio() < 0.25 ? -valor : valor,
            tag: aleatorio() < 0.3 ? undefined : um(TAGS),
          }),
        ),
      );
    }
    return comandos.reduce((estado, comando) => {
      const resultado = apply(estado, comando, HOJE);
      if (!resultado.ok) throw new Error(resultado.error);
      return resultado.value;
    }, emptyState());
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
  date?: IsoDate;
  description?: string;
  jar?: Jar;
  paymentMethod?: PaymentMethod;
  amount?: number;
  tag?: string | null;
}): ExpenseToSave {
  return {
    date: "2026-09-12",
    description: "Mercado",
    jar: "fixed-costs",
    paymentMethod: "debit-card",
    amount: 10_000,
    installments: 1,
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
