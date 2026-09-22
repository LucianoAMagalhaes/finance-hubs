import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  INCOME_SOURCES,
  DEFAULT_PERCENTAGES,
  type Command,
  type IsoDate,
  type State,
  type ExpenseToSave,
  type Result,
} from "@/domain";
import { createMonthFlow } from "./monthFlow";

const TODAY: IsoDate = "2026-09-18";

const GROCERIES: ExpenseToSave = {
  date: "2026-09-10",
  description: "Mercado",
  jar: "fixed-costs",
  paymentMethod: "pix",
  amount: 45_000,
  installments: 1,
};

describe("saving a record", () => {
  it("in the open month, the form closes, the state is what the server returned, and there is no notice", async () => {
    const { flow } = build();
    flow.openExpense(null);

    const error = await flow.save(saveExpense(GROCERIES), "2026-09");

    expect(error).toBeNull();
    expect(flow.snapshot()).toMatchObject({ form: null, notice: null });
    expect(flow.snapshot().view.occurrences.map((o) => o.description)).toEqual(["Mercado"]);
  });

  it("dated in another month, it gives notice and stays where it is; 'Ir para' changes the month and the notice goes away", async () => {
    const { flow } = build();
    flow.openExpense(null);

    await flow.save(saveExpense({ ...GROCERIES, date: "2026-10-05" }), "2026-10");

    expect(flow.snapshot()).toMatchObject({ month: "2026-09", form: null, notice: { text: "Gasto lançado em outubro de 2026.", month: "2026-10" } });

    flow.changeMonth(flow.snapshot().notice!.month);

    expect(flow.snapshot()).toMatchObject({ month: "2026-10", notice: null });
  });

  it("the notice says whether the record is new or corrected, in each form", async () => {
    const { flow } = build(after(saveExpense(GROCERIES)));
    const groceries = flow.snapshot().state.expenses[0]!;
    flow.openExpense(groceries);
    await flow.save(saveExpense({ ...GROCERIES, id: groceries.id, date: "2026-10-05" }), "2026-10");
    expect(flow.snapshot().notice?.text).toBe("Gasto salvo em outubro de 2026.");

    flow.openIncome(null);
    await flow.save(saveIncome("2026-10-05"), "2026-10");
    expect(flow.snapshot().notice?.text).toBe("Entrada lançada em outubro de 2026.");
  });

  it("if the preview in the browser refuses, the server is not even called and the form stays open", async () => {
    const { flow, server } = build();
    flow.openExpense(null);

    const error = await flow.save(saveExpense({ ...GROCERIES, description: " " }), "2026-09");

    expect(error).toBe("Informe uma descrição.");
    expect(server.calls).toEqual([]);
    expect(flow.snapshot().form).toEqual({ record: "expense", expense: null });
  });

  it("if the server refuses, the error comes back and the screen's state does not change", async () => {
    // Another tab already deleted the expense: the screen still has it, the server does not.
    const { flow } = build(after(saveExpense(GROCERIES)), emptyState());
    const before = flow.snapshot().state;
    flow.openExpense(before.expenses[0]!);

    const error = await flow.delete();

    expect(error).toBe("Esse lançamento não existe mais.");
    expect(flow.snapshot().state).toBe(before);
    expect(flow.snapshot().form).not.toBeNull();
  });
});

describe("navigating the screen", () => {
  it("changing month clears the notice and the draft, and the open group stays", async () => {
    const { flow } = build();
    flow.openExpense(null);
    await flow.save(saveExpense({ ...GROCERIES, date: "2026-10-05" }), "2026-10");
    flow.open({ kind: "group", key: "fixed-costs" });
    flow.editPercentages();
    expect(flow.snapshot().notice).not.toBeNull();

    flow.changeMonth("2026-08");

    expect(flow.snapshot()).toMatchObject({ month: "2026-08", draft: null, notice: null, opened: { kind: "group", key: "fixed-costs" } });
  });

  it("changing axis closes the open group, but not 'all expenses'", () => {
    const { flow } = build();
    flow.open({ kind: "group", key: "fixed-costs" });
    flow.changeAxis("tag");
    expect(flow.snapshot()).toMatchObject({ axis: "tag", opened: null });

    flow.toggleExpenses();
    flow.changeAxis("jar");
    expect(flow.snapshot().opened).toEqual({ kind: "all" });

    flow.toggleExpenses();
    expect(flow.snapshot().opened).toBeNull();
  });

  it("a prepayment's occurrence opens the prepayment; an installment's, the installment purchase", () => {
    const purchase: ExpenseToSave = { ...GROCERIES, date: "2026-06-10", paymentMethod: "credit-card", amount: 60_000, installments: 6 };
    const { flow } = build(
      after(saveExpense(purchase), { type: "save-prepayment", prepayment: { expense: 1, date: "2026-09-12", installments: 2, amount: 19_000 } }),
    );
    const [installment, prepayment] = flow.snapshot().view.occurrences;

    flow.openOccurrence(prepayment!);
    expect(flow.snapshot().form).toMatchObject({
      record: "prepayment",
      purchase: { id: 1, description: "Mercado" },
      prepayment: { id: 1, installments: 2 },
    });

    flow.openOccurrence(installment!);
    expect(flow.snapshot().form).toMatchObject({ record: "expense", expense: { id: 1 } });
  });

  it("from the installment purchase's form, prepaying opens a new prepayment of it", () => {
    const { flow } = build(after(saveExpense({ ...GROCERIES, paymentMethod: "credit-card", installments: 3 })));
    flow.openExpense(flow.snapshot().state.expenses[0]!);

    flow.prepay();

    expect(flow.snapshot().form).toMatchObject({ record: "prepayment", purchase: { id: 1 }, prepayment: null });
  });
});

describe("renaming a tag", () => {
  it("the open group becomes the new tag's, and the rename form closes", async () => {
    const { flow } = build(after(saveExpense({ ...GROCERIES, tag: "casa" })));
    flow.changeAxis("tag");
    flow.open({ kind: "group", key: "casa" });
    flow.openRename("casa");

    const error = await flow.renameTag("Minha Casa", false);

    expect(error).toBeNull();
    expect(flow.snapshot()).toMatchObject({ tagToRename: null, opened: { kind: "group", key: "minha-casa" } });
  });
});

describe("deleting, ending and restoring", () => {
  it("deleting and ending close the form", async () => {
    const recurring: Command = {
      type: "create-recurring",
      recurring: { date: "2026-08-05", description: "Aluguel", jar: "fixed-costs", paymentMethod: "pix", amount: 200_000 },
    };
    const { flow } = build(after(saveExpense(GROCERIES), recurring));
    const [groceries, rent] = flow.snapshot().state.expenses;

    flow.openExpense(groceries!);
    expect(await flow.delete()).toBeNull();
    expect(flow.snapshot().form).toBeNull();

    flow.openExpense(rent!);
    expect(await flow.end()).toBeNull();
    expect(flow.snapshot().form).toBeNull();
    expect(flow.snapshot().view.occurrences).toEqual([]);
  });

  it("restoring takes it out of the trash and leaves the trash open", async () => {
    const { flow } = build(after(saveExpense(GROCERIES), { type: "delete", record: "expense", id: 1 }));
    flow.openTrash();
    expect(flow.snapshot().trash).toHaveLength(1);

    expect(await flow.restore("expense", 1)).toBeNull();

    expect(flow.snapshot()).toMatchObject({ trashOpen: true, trash: [] });
  });
});

describe("editing the percentages", () => {
  it("while there is a draft, the projection uses it; saving clears the draft", async () => {
    const { flow } = build();
    flow.editPercentages();
    const draft = flow.snapshot().draft!;

    flow.changeDraft({ ...draft, "fixed-costs": "70" });

    expect(flow.snapshot().view.jars.find((j) => j.id === "fixed-costs")!.percentage).toBe(70);

    const error = await flow.savePercentages({ ...DEFAULT_PERCENTAGES, "fixed-costs": 35, comfort: 10 });

    expect(error).toBeNull();
    expect(flow.snapshot().draft).toBeNull();
    expect(flow.snapshot().view.jars.find((j) => j.id === "fixed-costs")!.percentage).toBe(35);
  });
});

describe("subscribe", () => {
  it("notifies subscribers on each change, and the snapshot does not change between them", () => {
    const { flow } = build();
    let notifications = 0;
    const unsubscribe = flow.subscribe(() => notifications++);

    expect(flow.snapshot()).toBe(flow.snapshot());
    flow.openTrash();
    unsubscribe();
    flow.closeTrash();

    expect(notifications).toBe(1);
  });

  it("an action the server accepts changes the screen at once: new state and closed form together", async () => {
    const { flow } = build();
    flow.openExpense(null);
    const views: { form: unknown; occurrences: number }[] = [];
    flow.subscribe(() => views.push({ form: flow.snapshot().form, occurrences: flow.snapshot().view.occurrences.length }));

    await flow.save(saveExpense(GROCERIES), "2026-09");

    expect(views).toEqual([{ form: null, occurrences: 1 }]);
  });
});

/**
 * A flow wired to an in-memory server, which keeps its own state and answers
 * with `apply` — it can diverge from the screen's, as another tab would.
 */
function build(initial: State = emptyState(), onServer: State = initial) {
  const server = { state: onServer, calls: [] as Command[] };
  const execute = async (command: Command): Promise<Result<State>> => {
    server.calls.push(command);
    const result = apply(server.state, command, TODAY);
    if (result.ok) server.state = result.value;
    return result;
  };
  return { flow: createMonthFlow(initial, { today: TODAY, execute }), server };
}

const saveExpense = (expense: ExpenseToSave): Command => ({ type: "save-expense", expense });

const saveIncome = (date: IsoDate): Command => ({
  type: "save-income",
  income: { date, description: "Salário", source: INCOME_SOURCES[0]!.id, paymentMethod: "pix", amount: 500_000 },
});

/** The empty state after these commands. */
function after(...commands: Command[]): State {
  return commands.reduce((state, command) => {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, emptyState());
}
