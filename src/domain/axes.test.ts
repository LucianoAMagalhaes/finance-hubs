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

const TODAY: IsoDate = "2026-09-18";

describe("expense tag", () => {
  it("\"#Saúde Mental\" and \"saúde-mental\" become the same tag", () => {
    let state = save(emptyState(), expense({ tag: "#Saúde Mental", amount: 10_000 }));
    state = save(state, expense({ tag: "saúde-mental", amount: 5_000 }));

    const tags = groups(projectMonth(state, "2026-09"), "tag");

    expect(tags.map((g) => [g.name, g.total])).toEqual([["#saúde-mental", 15_000]]);
    expect(state.expenses.map((e) => (e as Purchase).tag)).toEqual(["saúde-mental", "saúde-mental"]);
  });

  it.each([
    ["  Transporte ", "transporte"],
    ["##Uber", "uber"],
    ["# casa  nova ", "casa-nova"],
    ["SAÚDE", "saúde"],
    ["sau\u0301de", "saúde"],
  ])("%j is stored as %j", (typed, stored) => {
    const state = save(emptyState(), expense({ tag: typed }));

    expect(state.expenses[0]).toMatchObject({ tag: stored });
  });

  it("accents are kept: \"saude\" and \"saúde\" are different tags", () => {
    let state = save(emptyState(), expense({ tag: "saude" }));
    state = save(state, expense({ tag: "saúde" }));

    expect(groups(projectMonth(state, "2026-09"), "tag").map((g) => g.name)).toEqual(["#saude", "#saúde"]);
  });

  it.each([["no tag", undefined], ["empty tag", ""], ["only spaces", "   "], ["only \"#\"", " # "], ["null", null]])(
    "%s stores the expense without a tag",
    (_, tag) => {
      const state = save(emptyState(), expense({ tag }));

      expect(state.expenses[0]).toMatchObject({ tag: null });
    },
  );

  it("a tag that is not text is rejected", () => {
    expect(apply(emptyState(), saveExpense(expense({ tag: 42 as never })), TODAY).ok).toBe(false);
  });

  it("correcting the expense can change or remove the tag", () => {
    const state = save(emptyState(), expense({ tag: "uber" }));
    const id = state.expenses[0]!.id;

    expect(save(state, { ...expense({ tag: "Transporte" }), id }).expenses[0]).toMatchObject({ tag: "transporte" });
    expect(save(state, { ...expense({ tag: "" }), id }).expenses[0]).toMatchObject({ tag: null });
  });

  it("the occurrence carries the expense's tag", () => {
    const state = save(emptyState(), expense({ tag: "casa" }));

    expect(projectMonth(state, "2026-09").occurrences[0]!.tag).toBe("casa");
  });

  it("the tags in use are the expenses' tags, without repeats, in alphabetical order", () => {
    let state = save(emptyState(), expense({ tag: "uber" }));
    state = save(state, expense({ tag: "casa", date: "2027-01-10" }));
    state = save(state, expense({ tag: "Uber" }));
    state = save(state, expense({}));

    expect(tagsInUse(state)).toEqual(["casa", "uber"]);
  });

  it("normalizeTag is the same rule the command applies", () => {
    expect(normalizeTag("#Saúde Mental")).toBe("saúde-mental");
    expect(normalizeTag(" # ")).toBeNull();
  });

  it("the tag's color is one of eight hues, derived from the name alone", () => {
    const hues = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "transporte", "casa"].map(tagHue));

    expect(tagHue("transporte")).toBe(tagHue("transporte"));
    expect(hues.size).toBeGreaterThan(1);
    expect(hues.size).toBeLessThanOrEqual(8);
  });
});

describe("groups of an axis", () => {
  it("on the jar axis, the six jars in order, each with its total", () => {
    const state = save(emptyState(), expense({ jar: "comfort", amount: 42_000 }));

    const jars = groups(projectMonth(state, "2026-09"), "jar");

    expect(jars.map((g) => g.key)).toEqual(JARS.map((j) => j.id));
    expect(jars.find((g) => g.key === "comfort")).toMatchObject({ name: "Conforto", total: 42_000 });
  });

  it("the \"sem tag\" group exists when there is an occurrence without a tag, and comes last", () => {
    let state = save(emptyState(), expense({ tag: "uber", amount: 3_000 }));
    state = save(state, expense({ amount: 7_000 }));
    state = save(state, expense({ tag: "casa", amount: 1_000 }));

    const tags = groups(projectMonth(state, "2026-09"), "tag");

    expect(tags.map((g) => [g.key, g.name, g.total])).toEqual([
      ["casa", "#casa", 1_000],
      ["uber", "#uber", 3_000],
      [null, "sem tag", 7_000],
    ]);
  });

  it("with no untagged occurrence, there is no \"sem tag\" group", () => {
    const state = save(emptyState(), expense({ tag: "uber" }));

    expect(groups(projectMonth(state, "2026-09"), "tag").map((g) => g.key)).toEqual(["uber"]);
  });

  it("on the payment method axis, only the methods used in the month, in list order", () => {
    let state = save(emptyState(), expense({ paymentMethod: "pix" }));
    state = save(state, expense({ paymentMethod: "cash" }));
    state = save(state, expense({ paymentMethod: "boleto", date: "2026-10-05" }));

    expect(groups(projectMonth(state, "2026-09"), "payment-method").map((g) => g.name)).toEqual(["Dinheiro", "PIX"]);
  });

  it("a payment method group can go negative: refund only", () => {
    let state = save(emptyState(), expense({ paymentMethod: "credit-card", amount: 50_000 }));
    state = save(state, expense({ paymentMethod: "pix", amount: -29_790 }));

    const pix = groups(projectMonth(state, "2026-09"), "payment-method").find((g) => g.key === "pix")!;

    expect(pix.total).toBe(-29_790);
    expect(pix.occurrences).toHaveLength(1);
  });

  it("a group's occurrences come in date order", () => {
    let state = save(emptyState(), expense({ date: "2026-09-20", description: "Farmácia", tag: "saúde" }));
    state = save(state, expense({ date: "2026-09-03", description: "Consulta", tag: "saúde" }));

    const health = groups(projectMonth(state, "2026-09"), "tag")[0]!;

    expect(health.occurrences.map((o) => o.description)).toEqual(["Consulta", "Farmácia"]);
  });

  it("\"Todos os gastos do mês\" has every occurrence and sums the expenses", () => {
    let state = save(emptyState(), expense({ amount: 50_000 }));
    state = save(state, expense({ amount: -1_000, tag: "casa" }));
    state = save(state, expense({ date: "2026-10-01" }));
    const view = projectMonth(state, "2026-09");

    const all = allExpenses(view);

    expect(all.name).toBe("Todos os gastos do mês");
    expect(all.total).toBe(49_000);
    expect(all.occurrences).toEqual(view.occurrences);
  });
});

describe("axes invariant (property)", () => {
  const AXES: Axis[] = ["jar", "payment-method", "tag"];
  const MONTHS: Month[] = ["2026-08", "2026-09", "2026-10"];

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("state generated with seed %i", (seed) => {
    const state = generatedState(seed);

    for (const month of MONTHS) {
      const view = projectMonth(state, month);
      const jarsSum = view.jars.reduce((s, j) => s + j.total, 0);
      expect(jarsSum).toBe(view.aggregates.monthExpenses);

      for (const axis of AXES) {
        const gs = groups(view, axis);
        expect(gs.reduce((s, g) => s + g.total, 0), `axis ${axis} in ${month}`).toBe(view.aggregates.monthExpenses);
        // Each occurrence falls into exactly one group of the axis.
        const seen = gs.flatMap((g) => g.occurrences);
        expect(seen).toHaveLength(view.occurrences.length);
        expect(new Set(seen)).toEqual(new Set(view.occurrences));
        for (const g of gs) expect(g.total).toBe(g.occurrences.reduce((s, o) => s + o.amount, 0));
      }
      expect(allExpenses(view).total).toBe(view.aggregates.monthExpenses);
    }
  });

  /** Incomes, expenses and refunds, with and without tags, spread over three months, all through commands. */
  function generatedState(seed: number): State {
    const random = generator(seed);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const date = (): IsoDate => `${pick(MONTHS)}-${String(1 + Math.floor(random() * 28)).padStart(2, "0")}` as IsoDate;
    const TAGS = ["#Transporte", "transporte", "Saúde Mental", "saude", "casa", "", "  "];
    const commands: Command[] = [];
    for (let i = Math.floor(random() * 4); i > 0; i--) {
      commands.push({
        type: "save-income",
        income: { date: date(), description: "Salário", source: "salary", paymentMethod: "pix", amount: 1 + Math.floor(random() * 1_000_000) },
      });
    }
    for (let i = Math.floor(random() * 25); i > 0; i--) {
      const amount = 1 + Math.floor(random() * 200_000);
      commands.push(
        saveExpense(
          expense({
            date: date(),
            jar: pick(JARS).id,
            paymentMethod: pick(PAYMENT_METHODS).id,
            amount: random() < 0.25 ? -amount : amount,
            tag: random() < 0.3 ? undefined : pick(TAGS),
          }),
        ),
      );
    }
    return commands.reduce((state, command) => {
      const result = apply(state, command, TODAY);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    }, emptyState());
  }
});

/** mulberry32: reproducible, so a seed that fails always fails. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function expense(fields: {
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
    ...fields,
  };
}

function saveExpense(expense: ExpenseToSave): Command {
  return { type: "save-expense", expense };
}

function save(state: State, expense: ExpenseToSave): State {
  const result = apply(state, saveExpense(expense), TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
