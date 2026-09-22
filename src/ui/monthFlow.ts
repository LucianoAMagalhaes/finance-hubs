import {
  findPrepayment,
  apply,
  monthBornBy,
  trashItems,
  monthOf,
  monthName,
  normalizeTag,
  projectMonth,
  renamePreview,
  tagsInUse,
  type Prepayment,
  type Command,
  type Purchase,
  type IsoDate,
  type Axis,
  type Income,
  type State,
  type TrashItem,
  type Expense,
  type Month,
  type Occurrence,
  type Percentages,
  type RenamePreview,
  type Result,
  type MonthView,
} from "@/domain";
import { previewPercentages, draftFrom, type Draft } from "./percentagesDraft";

/** What is open in the detail: a group of the axis, or the whole month's feed (the "Despesas" card). */
export type Opened = { kind: "group"; key: string | null } | { kind: "all" };

/** The open form, already resolved against the state: a new record (null), or the one being corrected. */
export type OpenForm =
  | { record: "income"; income: Income | null }
  | { record: "expense"; expense: Expense | null }
  /** An installment purchase's prepayment: new (null) or the one being reviewed. */
  | { record: "prepayment"; purchase: Purchase; prepayment: Prepayment | null };

/** After saving something dated in another month, the screen stays where it is and points there. */
type Notice = { text: string; month: Month };

/** The tag being renamed, and the other tags in use, to suggest while typing. */
export type Rename = { tag: string; suggestions: string[] };

/** Everything the month screen draws. */
export type Screen = {
  month: Month;
  view: MonthView;
  trash: TrashItem[];
  /** The tags in use, suggested while typing one on an expense. */
  tags: string[];
  form: OpenForm | null;
  notice: Notice | null;
  /** The percentages being edited; while it exists, the projection uses them. */
  draft: Draft | null;
  axis: Axis;
  /** The group open in the master-detail; it stays open when the month changes, if it exists there. */
  opened: Opened | null;
  trashOpen: boolean;
  /** Open when a tag is being renamed; it is not a record, and so not a form like the others. */
  rename: Rename | null;
};

/** The door to the server: stores the command and returns the new state, or the refusal. */
export type Execute = (command: Command) => Promise<Result<State>>;

/** The form as the flow keeps it: the prepayment by ids, resolved on every read. */
type Form =
  | { record: "income"; income: Income | null }
  | { record: "expense"; expense: Expense | null }
  | { record: "prepayment"; purchase: number; prepayment: number | null };

type Memory = Omit<Screen, "view" | "trash" | "tags" | "form" | "rename"> & {
  state: State;
  form: Form | null;
  tagToRename: string | null;
};

/** What the last screen was built from, to rebuild only what changed. */
type Before = { memory: Memory; screen: Screen };

/**
 * The month screen's flow, outside React. It keeps the state in memory and
 * projects the month; changing month only changes the projection, and never
 * stores anything. Saving checks in the browser, sends the command to the
 * server and swaps the state for what it returns. The async actions return
 * the error, or null if it worked.
 */
export function createMonthFlow(initialState: State, { today, execute }: { today: IsoDate; execute: Execute }) {
  let memory: Memory = {
    state: initialState,
    month: monthOf(today),
    form: null,
    notice: null,
    draft: null,
    axis: "jar",
    opened: null,
    trashOpen: false,
    tagToRename: null,
  };
  let screen = buildScreen(memory, null);
  const listeners = new Set<() => void>();

  function update(change: Partial<Memory>) {
    const before = { memory, screen };
    memory = { ...memory, ...change };
    screen = buildScreen(memory, before);
    for (const listener of listeners) listener();
  }

  /**
   * Checks in the browser, stores on the server and swaps the state for what
   * it returns — together with what changes on the screen afterwards, in a
   * single change.
   */
  async function send(command: Command, then: () => Partial<Memory> = () => ({})): Promise<string | null> {
    const preview = apply(memory.state, command, today);
    if (!preview.ok) return preview.error;
    let result: Result<State>;
    try {
      result = await execute(command);
    } catch (cause) {
      // Only around the door to the server: the domain's refusals come back as values,
      // so anything thrown here is the process not being reachable — or a bug worth the stack.
      console.error(cause);
      return "Não foi possível falar com o servidor. Tente de novo.";
    }
    if (!result.ok) return result.error;
    update({ state: result.value, ...then() });
    return null;
  }

  /** The open form; the actions that read it only exist with it on the screen. */
  const formOnScreen = () => memory.form!;

  return {
    snapshot: (): Screen => screen,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    changeMonth: (month: Month) => update({ month, notice: null, draft: null }),
    dismissNotice: () => update({ notice: null }),

    /** One axis at a time. Changing axis closes the open group, but not the month's feed. */
    changeAxis: (axis: Axis) => update({ axis, opened: memory.opened?.kind === "all" ? memory.opened : null }),
    open: (opened: Opened | null) => update({ opened }),
    toggleExpenses: () => update({ opened: memory.opened?.kind === "all" ? null : { kind: "all" } }),

    openIncome: (income: Income | null) => update({ form: { record: "income", income } }),
    openExpense: (expense: Expense | null) => update({ form: { record: "expense", expense } }),
    /** A prepayment's occurrence opens the prepayment itself; the others, the expense. */
    openOccurrence: (o: Occurrence) =>
      update({
        form: o.prepayment
          ? { record: "prepayment", purchase: o.expense, prepayment: o.prepayment.id }
          : { record: "expense", expense: memory.state.expenses.find((e) => e.id === o.expense)! },
      }),
    /** From the installment purchase's form to a new prepayment of it. */
    prepay() {
      const { expense } = formOnScreen() as { expense: Expense };
      update({ form: { record: "prepayment", purchase: expense.id, prepayment: null } });
    },
    closeForm: () => update({ form: null }),

    /** Saves the open form's record and, if it makes another month be born, gives notice without leaving this one. */
    async save(command: Command): Promise<string | null> {
      const { month } = memory;
      const label = labelOf(formOnScreen());
      const born = monthBornBy(command);
      return send(command, () => ({
        form: null,
        notice: born !== null && born !== month ? { text: `${label} em ${monthName(born)}.`, month: born } : null,
      }));
    },
    /** Deleting sends to the trash and closes the form; the affected months recalculate with the new state. */
    delete: () => send(deleteCommand(formOnScreen()), () => ({ form: null })),
    /** Ending closes the form, like deleting; in the start month, the recurring expense goes to the trash. */
    end() {
      const { expense } = formOnScreen() as { expense: Expense };
      return send({ type: "end-recurring", id: expense.id, month: memory.month }, () => ({ form: null }));
    },

    openTrash: () => update({ trashOpen: true }),
    closeTrash: () => update({ trashOpen: false }),
    restore: ({ record, id }: TrashItem) => send({ type: "restore", record, id }),

    openRename: (tag: string) => update({ tagToRename: tag }),
    closeRename: () => update({ tagToRename: null }),
    /** What saving this name would do, asked while it is being typed. */
    previewRename: (to: string): RenamePreview => renamePreview(memory.state, memory.tagToRename!, to),
    /**
     * Renaming changes the name in every month, so the open group becomes the
     * new tag's — or the one it absorbed, in a merge —, and the detail stays
     * where it was instead of vanishing with the old name.
     */
    renameTag(to: string, confirmed: boolean): Promise<string | null> {
      const from = memory.tagToRename!;
      return send({ type: "rename-tag", from, to, merge: confirmed }, () => ({
        tagToRename: null,
        opened: { kind: "group", key: normalizeTag(to) },
      }));
    },

    editPercentages: () => update({ draft: draftFrom(screen.view.jars) }),
    changeDraft: (draft: Draft) => update({ draft }),
    cancelDraft: () => update({ draft: null }),
    savePercentages: (percentages: Percentages) =>
      send({ type: "save-percentages", month: memory.month, percentages }, () => ({ draft: null })),
  };
}

/** The screen from memory; the projection, the trash and the tags are only rebuilt when what they read changes. */
function buildScreen(memory: Memory, before: Before | null): Screen {
  const { state, tagToRename, form, ...rest } = memory;
  const { month, draft } = rest;
  const sameState = before?.memory.state === state;
  const view =
    sameState && before.memory.month === month && before.memory.draft === draft
      ? before.screen.view
      : projectMonth(state, month, draft ? previewPercentages(draft) : undefined);
  const trash = sameState ? before.screen.trash : trashItems(state);
  const tags = sameState ? before.screen.tags : tagsInUse(state);
  return {
    ...rest,
    view,
    trash,
    tags,
    form: form && resolve(state, form),
    rename: tagToRename === null ? null : { tag: tagToRename, suggestions: tags.filter((t) => t !== tagToRename) },
  };
}

function resolve(state: State, form: Form): OpenForm {
  if (form.record !== "prepayment") return form;
  return {
    record: "prepayment",
    purchase: state.expenses.find((e) => e.id === form.purchase) as Purchase,
    prepayment: form.prepayment === null ? null : findPrepayment(state, form.prepayment)!.prepayment,
  };
}

function labelOf(form: Form): string {
  switch (form.record) {
    case "income":
      return form.income ? "Entrada salva" : "Entrada lançada";
    case "expense":
      return form.expense ? "Gasto salvo" : "Gasto lançado";
    case "prepayment":
      return form.prepayment ? "Antecipação salva" : "Parcelas antecipadas";
  }
}

/** What the open form sends to the trash: the undone prepayment, or the record being corrected. */
function deleteCommand(form: Form): Command {
  switch (form.record) {
    case "income":
      return { type: "delete", record: "income", id: form.income!.id };
    case "expense":
      return { type: "delete", record: "expense", id: form.expense!.id };
    case "prepayment":
      return { type: "delete", record: "prepayment", id: form.prepayment! };
  }
}
