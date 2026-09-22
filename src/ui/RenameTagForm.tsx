"use client";

import { useState, type FormEvent } from "react";
import type { RenamePreview } from "@/domain";
import type { Rename } from "./monthFlow";
import { Refusal, plural, TagPill } from "./parts";
import { Sheet } from "./Sheet";
import { useAction } from "./useAction";

type Props = {
  /** The tag being renamed, and the other tags in use, suggested while typing. */
  rename: Rename;
  /** What saving this name would do, asked on every keystroke. */
  preview: (to: string) => RenamePreview;
  /** Sends the rename; `confirmed` is the merge checkbox. Returns the validation error, or null if it renamed. */
  submit: (to: string, confirmed: boolean) => Promise<string | null>;
  close: () => void;
};

/**
 * Renaming a tag across the whole history. When the new name already belongs
 * to another tag, what goes out is a merge — the two become one and nothing
 * separates the occurrences anymore —, so it only goes out with the
 * confirmation checked, which is what the command requires.
 */
export function RenameTagForm({ rename: { tag, suggestions }, preview, submit, close }: Props) {
  const [name, setName] = useState(tag);
  const [confirmed, setConfirmed] = useState(false);
  const { run, running, refusal } = useAction();
  // The same question the command asks, asked before the person presses anything.
  const { normalized, merge, expenses, mergeExpenses } = preview(name);

  async function send(event: FormEvent) {
    event.preventDefault();
    await run(() => submit(name, confirmed));
  }

  return (
    <Sheet labelledBy="rename-tag-title" close={close}>
      <form onSubmit={send}>
        <header>
          <h2 id="rename-tag-title">
            Renomear <TagPill tag={tag} />
          </h2>
          <p className="hint">
            O nome novo vale no histórico todo: em {plural(expenses, "gasto")}, em todos os meses, nas compras e nas vigências dos
            recorrentes. A cor muda junto, porque sai do nome.
          </p>
        </header>
        <div className="content">
          <label className="field">
            <span>Nome novo</span>
            <input
              required
              autoFocus
              list="merge-tags"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setConfirmed(false);
              }}
              placeholder="Ex.: mobilidade"
            />
            <datalist id="merge-tags">
              {suggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {normalized && normalized !== name && (
              <span className="hint">
                Grava como <TagPill tag={normalized} />
              </span>
            )}
          </label>
          {merge && (
            <>
              <p className="notice">
                Já existe a tag <TagPill tag={merge} />,{" "}
                {/* Zero is the tag that only sleeps in the trash: it is on no live expense, but comes back on restore. */}
                {mergeExpenses === 0 ? "num gasto que está na lixeira" : `em ${plural(mergeExpenses, "gasto")}`}. Renomear{" "}
                <strong>funde as duas</strong>: {plural(expenses, "gasto")} de #{tag} passam para #{merge}, e #{tag} deixa de
                existir. Depois nada diz de qual nome cada gasto veio.
              </p>
              <label className="check">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>
                  Confirmo fundir #{tag} com #{merge}
                </span>
              </label>
            </>
          )}
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running || (merge !== null && !confirmed)}>
            {merge ? "Fundir as duas" : "Renomear"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
