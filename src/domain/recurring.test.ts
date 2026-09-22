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

const TODAY: IsoDate = "2026-09-18";

describe("recurring without an end", () => {
  it("falls every month from the start month on, on the recurring's day, and in none before", () => {
    const state = create(emptyState(), recurring({ date: "2026-09-05", amount: 5_590 }));

    expect(amountsByMonth(state, ["2026-08", "2026-09", "2026-10", "2027-09", "2040-01"])).toEqual([[], [5_590], [5_590], [5_590], [5_590]]);
    expect(projectMonth(state, "2031-03").occurrences[0]).toMatchObject({ date: "2031-03-05", description: "Netflix", jar: "pleasures" });
  });

  it("shows up in a very distant month with no cost proportional to the horizon", () => {
    const state = create(emptyState(), recurring({ date: "2026-09-05", amount: 5_590 }));
    const distant = "99999-12" as Month;

    const start = performance.now();
    for (let i = 0; i < 1_000; i++) projectMonth(state, distant);
    const duration = performance.now() - start;

    expect(projectMonth(state, distant).occurrences.map((o) => [o.date, o.amount])).toEqual([["99999-12-05", 5_590]]);
    // Walking month by month to get there would take ~1.2 million steps per projection.
    expect(duration).toBeLessThan(1_000);
  });

  it("the occurrence says it is recurring, since when, and since when the period applies", () => {
    let state = create(emptyState(), recurring({ date: "2026-01-05", amount: 150_000 }));
    state = change(state, 1, "2026-07", period({ amount: 165_000 }));

    expect(projectMonth(state, "2026-09").occurrences[0]).toMatchObject({
      installment: null,
      recurring: { since: "2026-01", periodSince: "2026-07" },
    });
  });

  it("a recurring refund gives the same amount back to the jar every month", () => {
    const state = create(emptyState(), recurring({ date: "2026-09-10", amount: -2_000 }));

    expect(amountsByMonth(state, ["2026-09", "2026-12"])).toEqual([[-2_000], [-2_000]]);
    expect(projectMonth(state, "2026-12").jars.find((j) => j.id === "pleasures")!.total).toBe(-2_000);
  });
});

describe("recurring day", () => {
  it("day 31 falls on the last day of shorter months: 28 or 29 in February", () => {
    const state = create(emptyState(), recurring({ date: "2026-01-31" }));

    expect(datesByMonth(state, ["2026-01", "2026-02", "2026-03", "2026-04", "2028-02"])).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2028-02-29",
    ]);
  });

  it("the day belongs to the recurring expense: changing in a month does not change the day", () => {
    let state = create(emptyState(), recurring({ date: "2026-01-31" }));
    state = change(state, 1, "2026-02", period({ amount: 7_000 }));

    expect(datesByMonth(state, ["2026-02", "2026-03"])).toEqual(["2026-02-28", "2026-03-31"]);
  });
});

describe("periods", () => {
  /** Rent of R$ 1.500 since January, which changes to R$ 1.650 in July. */
  function rent(): State {
    const state = create(emptyState(), recurring({ date: "2026-01-05", description: "Aluguel", jar: "fixed-costs", amount: 150_000 }));
    return change(state, 1, "2026-07", period({ description: "Aluguel", jar: "fixed-costs", amount: 165_000 }));
  }

  it("changing in a month applies from then on, and earlier months do not change", () => {
    expect(amountsByMonth(rent(), ["2026-01", "2026-06", "2026-07", "2027-03"])).toEqual([[150_000], [150_000], [165_000], [165_000]]);
  });

  it("correcting March to R$ 1.550 applies until the next change: July stays at R$ 1.650", () => {
    const state = change(rent(), 1, "2026-03", period({ description: "Aluguel", jar: "fixed-costs", amount: 155_000 }));

    expect(amountsByMonth(state, ["2026-02", "2026-03", "2026-06", "2026-07", "2026-12"])).toEqual([
      [150_000],
      [155_000],
      [155_000],
      [165_000],
      [165_000],
    ]);
    expect(periodsWithEnd(recurringOf(state)).map((p) => [p.since, p.until, p.amount])).toEqual([
      ["2026-01", "2026-02", 150_000],
      ["2026-03", "2026-06", 155_000],
      ["2026-07", null, 165_000],
    ]);
  });

  it("changing again in a month that already starts a period replaces it, without creating another", () => {
    const state = change(rent(), 1, "2026-07", period({ description: "Aluguel", jar: "fixed-costs", amount: 170_000 }));

    expect(amountsByMonth(state, ["2026-06", "2026-07"])).toEqual([[150_000], [170_000]]);
    expect(periodsWithEnd(recurringOf(state))).toHaveLength(2);
  });

  it("to correct from the beginning, you open the start month", () => {
    const state = change(rent(), 1, "2026-01", period({ description: "Aluguel do apê", jar: "fixed-costs", amount: 150_000 }));

    expect(projectMonth(state, "2026-01").occurrences[0]!.description).toBe("Aluguel do apê");
    expect(projectMonth(state, "2026-06").occurrences[0]!.description).toBe("Aluguel do apê");
    expect(projectMonth(state, "2026-07").occurrences[0]!.description).toBe("Aluguel");
  });

  it("correcting March to July's amount, and then again, does not swallow July", () => {
    let state = change(rent(), 1, "2026-03", period({ description: "Aluguel", jar: "fixed-costs", amount: 165_000 }));
    state = change(state, 1, "2026-03", period({ description: "Aluguel", jar: "fixed-costs", amount: 155_000 }));

    expect(amountsByMonth(state, ["2026-02", "2026-03", "2026-07"])).toEqual([[150_000], [155_000], [165_000]]);
  });

  it("amount, jar, payment method, tag and description change within a period", () => {
    let state = create(emptyState(), recurring({ date: "2026-01-10", jar: "pleasures", paymentMethod: "pix", tag: "streaming" }));
    state = change(state, 1, "2026-05", { description: "Curso", jar: "knowledge", paymentMethod: "boleto", amount: 20_000, tag: "#Estudo" });

    expect(projectMonth(state, "2026-04").occurrences[0]).toMatchObject({ jar: "pleasures", paymentMethod: "pix", tag: "streaming" });
    expect(projectMonth(state, "2026-05").occurrences[0]).toMatchObject({
      description: "Curso",
      jar: "knowledge",
      paymentMethod: "boleto",
      tag: "estudo",
      amount: 20_000,
    });
    expect(tagsInUse(state)).toEqual(["estudo", "streaming"]);
  });

  it("changing outside the months the recurring falls in is rejected", () => {
    const state = end(rent(), 1, "2026-10");

    expect(apply(state, changeRecurring(1, "2025-12", period({})), TODAY).ok).toBe(false);
    expect(apply(state, changeRecurring(1, "2026-10", period({})), TODAY).ok).toBe(false);
  });
});

describe("ending a recurring", () => {
  /** Created in January, with changes in October and December. */
  function withFutureChanges(): State {
    let state = create(emptyState(), recurring({ date: "2026-01-05", amount: 10_000, tag: "casa" }));
    state = change(state, 1, "2026-10", period({ amount: 11_000, tag: "reforma" }));
    return change(state, 1, "2026-12", period({ amount: 12_000, tag: "casa" }));
  }

  it("ending in September removes September onwards; earlier months stay as they were", () => {
    const state = end(withFutureChanges(), 1, "2026-09");

    expect(amountsByMonth(state, ["2026-01", "2026-08", "2026-09", "2026-10", "2026-12", "2030-01"])).toEqual([
      [10_000],
      [10_000],
      [],
      [],
      [],
      [],
    ]);
  });

  it("ending permanently discards the periods from the end month on", () => {
    const state = end(withFutureChanges(), 1, "2026-09");

    expect(periodsWithEnd(recurringOf(state)).map((p) => [p.since, p.until])).toEqual([["2026-01", "2026-08"]]);
    expect(tagsInUse(state)).toEqual(["casa"]);
    expect(trashItems(state)).toEqual([]);
  });

  it("ending in a period's month discards it and the following ones, and keeps the earlier ones", () => {
    const state = end(withFutureChanges(), 1, "2026-12");

    expect(amountsByMonth(state, ["2026-09", "2026-11", "2026-12"])).toEqual([[10_000], [11_000], []]);
    expect(periodsWithEnd(recurringOf(state)).map((p) => p.since)).toEqual(["2026-01", "2026-10"]);
  });

  it("ending again, earlier, brings the end forward", () => {
    let state = end(withFutureChanges(), 1, "2026-09");
    state = end(state, 1, "2026-05");

    expect(amountsByMonth(state, ["2026-04", "2026-05", "2026-08"])).toEqual([[10_000], [], []]);
  });

  it("ending in the start month sends the whole recurring to the trash, from where it comes back intact", () => {
    const state = withFutureChanges();

    const ended = end(state, 1, "2026-01");

    expect(["2026-01", "2026-06", "2026-10", "2027-01"].flatMap((m) => projectMonth(ended, m as Month).occurrences)).toEqual([]);
    expect(trashItems(ended).map((i) => [i.record, i.id, i.deletedAt])).toEqual([["expense", 1, TODAY]]);

    const restored = applyOk(ended, { type: "restore", record: "expense", id: 1 });

    expect(restored).toEqual(state);
  });

  it("ending outside the months the recurring falls in is rejected", () => {
    const state = end(withFutureChanges(), 1, "2026-09");

    expect(apply(state, endRecurring(1, "2025-12"), TODAY).ok).toBe(false);
    expect(apply(state, endRecurring(1, "2026-09"), TODAY).ok).toBe(false);
    expect(apply(state, endRecurring(1, "2027-01"), TODAY).ok).toBe(false);
  });

  it("a recurring in the trash cannot be changed nor ended without first coming back", () => {
    const state = applyOk(withFutureChanges(), { type: "delete", record: "expense", id: 1 });

    expect(apply(state, changeRecurring(1, "2026-03", period({})), TODAY)).toEqual({ ok: false, error: expect.stringMatching(/lixeira/) });
    expect(apply(state, endRecurring(1, "2026-03"), TODAY)).toEqual({ ok: false, error: expect.stringMatching(/lixeira/) });
  });
});

describe("month birth with a recurring", () => {
  it("creating makes only the start month be born; the derived occurrences make no month be born", () => {
    const state = create(emptyState(), recurring({ date: "2026-09-05" }));

    expect(born(state)).toEqual(["2026-09"]);
    expect(projectMonth(state, "2026-10").occurrences).toHaveLength(1);
    expect(projectMonth(state, "2026-10").budget.born).toBe(false);
  });

  it("changing makes the month the change applies from be born", () => {
    const state = change(create(emptyState(), recurring({ date: "2026-09-05" })), 1, "2026-12", period({ amount: 6_000 }));

    expect(born(state)).toEqual(["2026-09", "2026-12"]);
  });

  it("ending makes the end month be born", () => {
    const state = end(create(emptyState(), recurring({ date: "2026-09-05" })), 1, "2027-02");

    expect(born(state)).toEqual(["2026-09", "2027-02"]);
  });

  it("the month being born inherits from the most recent earlier one", () => {
    let state = create(emptyState(), recurring({ date: "2026-09-05" }));
    state = applyOk(state, { type: "save-percentages", month: "2026-10", percentages: { ...state.budgets["2026-09"]!, pleasures: 0 } });

    state = change(state, 1, "2026-12", period({ amount: 6_000 }));

    expect(state.budgets["2026-12"]).toEqual(state.budgets["2026-10"]);
  });
});

describe("recurring validation", () => {
  it.each([
    ["create", (s: State) => apply(s, createRecurring(recurring({ amount: 0 })), TODAY)],
    ["change", (s: State) => apply(s, changeRecurring(1, "2026-10", period({ amount: 0 })), TODAY)],
  ])("zero amount is rejected on %s", (_, attempt) => {
    const state = create(emptyState(), recurring({ date: "2026-09-05" }));

    expect(attempt(state)).toEqual({ ok: false, error: expect.stringMatching(/diferente de zero/) });
  });

  it.each([
    ["invalid date", { date: "2026-02-30" as IsoDate }],
    ["no description", { description: "  " }],
    ["jar that does not exist", { jar: "lazer" as never }],
    ["payment method that does not exist", { paymentMethod: "cheque" as never }],
    ["fractional amount", { amount: 10.5 }],
    ["tag that is not text", { tag: 42 as never }],
  ])("%s is rejected", (_, fields) => {
    expect(apply(emptyState(), createRecurring(recurring(fields)), TODAY).ok).toBe(false);
  });

  it("changing with an invalid month is rejected", () => {
    const state = create(emptyState(), recurring({ date: "2026-09-05" }));

    expect(apply(state, changeRecurring(1, "2026-13" as Month, period({})), TODAY).ok).toBe(false);
  });

  it("a recurring does not become a purchase: correcting it as upfront or installments is rejected", () => {
    const state = create(emptyState(), recurring({ date: "2026-09-05" }));
    const asPurchase: Command = {
      type: "save-expense",
      expense: { id: 1, date: "2026-09-05", description: "Netflix", jar: "pleasures", paymentMethod: "credit-card", amount: 5_590, installments: 1 },
    };

    expect(apply(state, asPurchase, TODAY)).toEqual({ ok: false, error: expect.stringMatching(/apague e lance de novo/) });
  });

  it("a purchase does not become a recurring: changing or ending it as a recurring is rejected", () => {
    const state = applyOk(emptyState(), {
      type: "save-expense",
      expense: { date: "2026-09-05", description: "Mercado", jar: "fixed-costs", paymentMethod: "pix", amount: 30_000, installments: 1 },
    });

    expect(apply(state, changeRecurring(1, "2026-09", period({})), TODAY)).toEqual({ ok: false, error: expect.stringMatching(/apague e lance de novo/) });
    expect(apply(state, endRecurring(1, "2026-09"), TODAY)).toEqual({ ok: false, error: expect.stringMatching(/apague e lance de novo/) });
  });

  it("changing or ending a recurring that does not exist is rejected", () => {
    expect(apply(emptyState(), changeRecurring(7, "2026-09", period({})), TODAY).ok).toBe(false);
    expect(apply(emptyState(), endRecurring(7, "2026-09"), TODAY).ok).toBe(false);
  });

  it("the recurring shares the numbering with purchases", () => {
    let state = applyOk(emptyState(), {
      type: "save-expense",
      expense: { date: "2026-09-05", description: "Mercado", jar: "fixed-costs", paymentMethod: "pix", amount: 30_000, installments: 1 },
    });
    state = create(state, recurring({ date: "2026-09-05" }));

    expect(projectMonth(state, "2026-09").occurrences.map((o) => o.expense)).toEqual([1, 2]);
  });
});

describe("axes invariant with recurrings (property)", () => {
  const AXES: Axis[] = ["jar", "payment-method", "tag"];
  const MONTHS: Month[] = Array.from({ length: 12 }, (_, i) => addMonths("2026-03", i));

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("state generated with seed %i", (seed) => {
    const state = generatedState(seed);

    for (const month of MONTHS) {
      const view = projectMonth(state, month);
      expect(view.jars.reduce((s, j) => s + j.total, 0)).toBe(view.aggregates.monthExpenses);
      for (const axis of AXES) {
        const gs = groups(view, axis);
        expect(gs.reduce((s, g) => s + g.total, 0), `axis ${axis} in ${month}`).toBe(view.aggregates.monthExpenses);
        expect(new Set(gs.flatMap((g) => g.occurrences))).toEqual(new Set(view.occurrences));
        expect(gs.flatMap((g) => g.occurrences)).toHaveLength(view.occurrences.length);
      }
      expect(allExpenses(view).total).toBe(view.aggregates.monthExpenses);
    }
  });

  /** Recurrings whose periods change jar and tag, some ended, mixed with purchases. */
  function generatedState(seed: number): State {
    const random = generator(seed);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const amount = () => (1 + Math.floor(random() * 300_000)) * (random() < 0.2 ? -1 : 1);
    const tag = () => (random() < 0.3 ? null : pick(["transporte", "casa", "#Saúde"]));
    const fields = (): PeriodToSave => ({ description: "Algo", jar: pick(JARS).id, paymentMethod: pick(PAYMENT_METHODS).id, amount: amount(), tag: tag() });
    const date = (): IsoDate => {
      const month = pick(MONTHS);
      return `${month}-${String(1 + Math.floor(random() * lastDayOfMonth(month))).padStart(2, "0")}` as IsoDate;
    };
    let state = emptyState();
    for (let i = Math.floor(random() * 25); i > 0; i--) {
      const recurrings = state.expenses.filter((e): e is Recurring => e.kind === "recurring" && e.deletedAt === null);
      const draw = random();
      const command: Command =
        draw < 0.3
          ? createRecurring({ ...fields(), date: date() })
          : draw < 0.6 && recurrings.length > 0
            ? changeRecurring(pick(recurrings).id, pick(MONTHS), fields())
            : draw < 0.7 && recurrings.length > 0
              ? endRecurring(pick(recurrings).id, pick(MONTHS))
              : { type: "save-expense", expense: { ...fields(), date: date(), paymentMethod: "credit-card", installments: 1 + Math.floor(random() * 4) } };
      // Changing or ending outside the months the recurring falls in is rejected: the state carries on.
      const result = apply(state, command, TODAY);
      if (result.ok) state = result.value;
    }
    return state;
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

function amountsByMonth(state: State, months: Month[]): number[][] {
  return months.map((m) => projectMonth(state, m).occurrences.map((o) => o.amount));
}

function datesByMonth(state: State, months: Month[]): IsoDate[] {
  return months.map((m) => projectMonth(state, m).occurrences[0]!.date);
}

const born = (state: State) => Object.keys(state.budgets).sort();

function recurringOf(state: State, id = 1): Recurring {
  const e = state.expenses.find((x) => x.id === id);
  if (e?.kind !== "recurring") throw new Error(`${id} is not recurring`);
  return e;
}

function recurring(fields: Partial<RecurringToCreate>): RecurringToCreate {
  return { date: "2026-09-05", description: "Netflix", jar: "pleasures", paymentMethod: "credit-card", amount: 5_590, ...fields };
}

function period(fields: Partial<PeriodToSave>): PeriodToSave {
  return { description: "Netflix", jar: "pleasures", paymentMethod: "credit-card", amount: 5_590, ...fields };
}

const createRecurring = (recurring: RecurringToCreate): Command => ({ type: "create-recurring", recurring });

const changeRecurring = (id: number, month: Month, period: PeriodToSave): Command => ({ type: "change-recurring", id, month, period });

const endRecurring = (id: number, month: Month): Command => ({ type: "end-recurring", id, month });

const create = (state: State, r: RecurringToCreate) => applyOk(state, createRecurring(r));

const change = (state: State, id: number, month: Month, p: PeriodToSave) => applyOk(state, changeRecurring(id, month, p));

const end = (state: State, id: number, month: Month) => applyOk(state, endRecurring(id, month));

function applyOk(state: State, command: Command): State {
  const result = apply(state, command, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
