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

const TODAY: IsoDate = "2026-09-18";

/**
 * `#transporte` on January's fuel, on an installment purchase that spans the year, and
 * on a recurring whose second period keeps it; `#casa` apart, to see that
 * renaming does not touch it.
 */
function history(): State {
  let state = save(emptyState(), expense({ date: "2026-01-10", description: "Combustível", tag: "transporte", amount: 30_000 }));
  state = save(state, expense({ date: "2026-02-05", description: "Pneus", tag: "#Transporte", amount: 120_000, installments: 12 }));
  state = save(state, expense({ date: "2026-03-01", description: "Faxina", tag: "casa", amount: 20_000 }));
  state = create(state, { date: "2026-01-15", description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 25_000, tag: "transporte" });
  return change(state, 4, "2026-06", { description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 28_000, tag: "transporte" });
}

describe("renaming a tag", () => {
  it("changes the name on purchases and on recurring periods, in past and future months", () => {
    const state = rename(history(), "transporte", "#Mobilidade");

    expect(tagsInUse(state)).toEqual(["casa", "mobilidade"]);
    expect(state.expenses.map((e) => (e.kind === "purchase" ? e.tag : e.periods.map((p) => p.tag)))).toEqual([
      "mobilidade",
      "mobilidade",
      "casa",
      ["mobilidade", "mobilidade"],
    ]);
    for (const month of ["2026-01", "2026-02", "2026-06", "2026-12", "2028-01"] as const) {
      expect(projectMonth(state, month).occurrences.map((o) => o.tag), month).not.toContain("transporte");
    }
    expect(projectMonth(state, "2026-01").occurrences.map((o) => o.tag)).toEqual(["mobilidade", "mobilidade"]);
  });

  it("the new name goes through the same tag normalization", () => {
    const state = rename(history(), "transporte", " # Ida e Volta ");

    expect(tagsInUse(state)).toEqual(["casa", "ida-e-volta"]);
  });

  it("nothing else about the expense changes: only the tag", () => {
    const before = history();

    const after = rename(before, "transporte", "mobilidade");

    expect(after.budgets).toEqual(before.budgets);
    expect(after.incomes).toEqual(before.incomes);
    expect(after.expenses.map((e) => ({ ...e, tag: null, periods: undefined }))).toEqual(
      before.expenses.map((e) => ({ ...e, tag: null, periods: undefined })),
    );
  });

  it("renaming makes no month be born: the tag has no month", () => {
    const before = create(emptyState(), { date: "2026-01-15", description: "Estacionamento", jar: "fixed-costs", paymentMethod: "pix", amount: 25_000, tag: "transporte" });

    const after = rename(before, "transporte", "mobilidade");

    expect(Object.keys(after.budgets)).toEqual(["2026-01"]);
  });

  it("the color follows the new name, because it is derived from it", () => {
    const state = rename(history(), "transporte", "mobilidade");

    expect(tagHue(groups(projectMonth(state, "2026-01"), "tag")[0]!.key!)).toBe(tagHue("mobilidade"));
  });

  it("an expense in the trash is also renamed, so the old name does not come back to life", () => {
    let state = save(emptyState(), expense({ tag: "transporte" }));
    state = save(state, expense({ date: "2026-09-13", tag: "transporte" }));
    state = applyOk(state, { type: "delete", record: "expense", id: 2 });

    state = rename(state, "transporte", "mobilidade");

    expect(state.expenses.map((e) => (e as Purchase).tag)).toEqual(["mobilidade", "mobilidade"]);
    expect(trashItems(state)).toHaveLength(1);

    const restored = applyOk(state, { type: "restore", record: "expense", id: 2 });

    expect(tagsInUse(restored)).toEqual(["mobilidade"]);
  });
});

describe("how many expenses use the tag", () => {
  it("counts the live expenses, with the recurring only once, and ignores the trash", () => {
    let state = history();

    expect(expensesWithTag(state, "transporte")).toBe(3);
    expect(expensesWithTag(state, "casa")).toBe(1);
    expect(expensesWithTag(state, "uber")).toBe(0);

    state = applyOk(state, { type: "delete", record: "expense", id: 1 });

    expect(expensesWithTag(state, "transporte")).toBe(2);
  });
});

describe("merging two tags", () => {
  /** `#transporte` in January and `#uber` in February, two expenses each. */
  function twoTags(): State {
    let state = save(emptyState(), expense({ date: "2026-01-10", tag: "transporte", amount: 30_000 }));
    state = save(state, expense({ date: "2026-01-20", tag: "transporte", amount: 10_000 }));
    state = save(state, expense({ date: "2026-01-25", tag: "uber", amount: 5_000 }));
    return save(state, expense({ date: "2026-02-03", tag: "uber", amount: 7_000 }));
  }

  it("renaming to a name that already exists, without confirmation, is rejected and changes nothing", () => {
    const before = twoTags();

    const refusal = apply(before, renameTag("transporte", "uber", false), TODAY);

    expect(refusal).toEqual({ ok: false, error: expect.stringMatching(/#uber/) });
    expect(apply(before, { type: "rename-tag", from: "transporte", to: "uber" } as Command, TODAY).ok).toBe(false);
  });

  it("with the confirmation, the two become one and the group totals add up", () => {
    const state = applyOk(twoTags(), renameTag("transporte", "uber", true));

    expect(tagsInUse(state)).toEqual(["uber"]);
    const january = groups(projectMonth(state, "2026-01"), "tag");
    expect(january.map((g) => [g.key, g.total])).toEqual([["uber", 45_000]]);
    expect(january[0]!.occurrences).toHaveLength(3);
    expect(groups(projectMonth(state, "2026-02"), "tag").map((g) => [g.key, g.total])).toEqual([["uber", 7_000]]);
  });

  it("the merge also joins a recurring's periods", () => {
    let state = create(emptyState(), { date: "2026-01-15", description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 25_000, tag: "transporte" });
    state = change(state, 1, "2026-06", { description: "Estacionamento", jar: "fixed-costs", paymentMethod: "boleto", amount: 28_000, tag: "uber" });

    state = applyOk(state, renameTag("transporte", "uber", true));

    expect(periodsWithEnd(state.expenses[0] as Recurring).map((p) => p.tag)).toEqual(["uber", "uber"]);
    expect(tagsInUse(state)).toEqual(["uber"]);
  });

  it("a name that only sleeps in the trash also asks for confirmation: it comes back on restore", () => {
    let state = save(emptyState(), expense({ tag: "transporte" }));
    state = save(state, expense({ date: "2026-09-13", tag: "uber" }));
    state = applyOk(state, { type: "delete", record: "expense", id: 2 });

    expect(tagsInUse(state)).toEqual(["transporte"]);
    expect(apply(state, renameTag("transporte", "uber", false), TODAY).ok).toBe(false);

    const merged = applyOk(state, renameTag("transporte", "uber", true));
    const restored = applyOk(merged, { type: "restore", record: "expense", id: 2 });

    expect(tagsInUse(restored)).toEqual(["uber"]);
  });

  it("confirming the merge when the new name does not exist renames as usual", () => {
    const state = applyOk(twoTags(), renameTag("transporte", "mobilidade", true));

    expect(tagsInUse(state)).toEqual(["mobilidade", "uber"]);
  });
});

describe("rename validation", () => {
  it("renaming a tag nobody uses is rejected", () => {
    const state = save(emptyState(), expense({ tag: "casa" }));

    expect(apply(state, renameTag("transporte", "mobilidade", false), TODAY).ok).toBe(false);
  });

  it("a tag that only exists in the trash is no longer in use: renaming it is rejected", () => {
    let state = save(emptyState(), expense({ tag: "transporte" }));
    state = applyOk(state, { type: "delete", record: "expense", id: 1 });

    expect(apply(state, renameTag("transporte", "mobilidade", false), TODAY).ok).toBe(false);
  });

  it("a new name with nothing left after normalization is rejected", () => {
    const state = save(emptyState(), expense({ tag: "transporte" }));

    for (const to of ["", "   ", " # "]) {
      expect(apply(state, renameTag("transporte", to, false), TODAY).ok, to).toBe(false);
    }
  });

  it("renaming to the same name is rejected, even if typed differently", () => {
    const state = save(emptyState(), expense({ tag: "transporte" }));

    expect(apply(state, renameTag("transporte", "#Transporte", false), TODAY)).toEqual({
      ok: false,
      error: expect.stringMatching(/já é o nome/),
    });
  });

  it("the source name also goes through normalization: it comes from the screen as it was clicked", () => {
    const state = save(emptyState(), expense({ tag: "transporte" }));

    expect(tagsInUse(applyOk(state, renameTag("#Transporte", "mobilidade", false)))).toEqual(["mobilidade"]);
  });

  it.each([
    ["from that is not text", 42 as never, "mobilidade"],
    ["to that is not text", "transporte", 42 as never],
  ])("%s is rejected", (_, from, to) => {
    const state = save(emptyState(), expense({ tag: "transporte" }));

    expect(apply(state, renameTag(from, to, false), TODAY).ok).toBe(false);
  });
});

function expense(fields: {
  date?: IsoDate;
  description?: string;
  jar?: Jar;
  amount?: number;
  installments?: number;
  tag?: string | null;
}): ExpenseToSave {
  return { date: "2026-09-12", description: "Mercado", jar: "fixed-costs", paymentMethod: "credit-card", amount: 10_000, installments: 1, ...fields };
}

const renameTag = (from: string, to: string, merge: boolean): Command => ({ type: "rename-tag", from, to, merge });

const rename = (state: State, from: string, to: string) => applyOk(state, renameTag(from, to, false));

const save = (state: State, expense: ExpenseToSave) => applyOk(state, { type: "save-expense", expense });

const create = (state: State, recurring: PeriodToSave & { date: IsoDate }) => applyOk(state, { type: "create-recurring", recurring });

const change = (state: State, id: number, month: Month, period: PeriodToSave) =>
  applyOk(state, { type: "change-recurring", id, month, period });

function applyOk(state: State, command: Command): State {
  const result = apply(state, command, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
