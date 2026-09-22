"use client";

import { useState, type FormEvent } from "react";
import { mergeOnRename, normalizeTag } from "@/domain";
import { Refusal, plural, TagPill } from "./parts";
import { Sheet } from "./Sheet";
import { useAction } from "./useAction";

type Props = {
  /** The tag being renamed, as it is stored. */
  tag: string;
  /** The tags in use, suggested while typing: picking one of them is merging. */
  tags: string[];
  /** The tags of the whole history, trash included: the new name merges against them. */
  historyTags: string[];
  /** How many expenses use a tag, to tell the size of the rename and of the merge. */
  expensesWithTag: (tag: string) => number;
  /** Sends the rename. Returns the validation error, or null if it renamed. */
  rename: (to: string, merge: boolean) => Promise<string | null>;
  close: () => void;
};

/**
 * Renaming a tag across the whole history. When the new name already belongs
 * to another tag, what goes out is a merge — the two become one and nothing
 * separates the occurrences anymore —, so it only goes out with the
 * confirmation checked, which is what the command requires.
 */
export function RenameTagForm({ tag, tags, historyTags, expensesWithTag, rename, close }: Props) {
  const [name, setName] = useState(tag);
  const [confirmed, setConfirmed] = useState(false);
  const { run, running, refusal } = useAction();
  const normalized = normalizeTag(name);
  const expenses = expensesWithTag(tag);
  // The same question the command asks: the confirmation requested here is the one it requires.
  const merge = mergeOnRename(historyTags, tag, name);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(() => rename(name, merge !== null && confirmed));
  }

  return (
    <Sheet labelledBy="rename-tag-title" close={close}>
      <form onSubmit={submit}>
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
              {tags
                .filter((t) => t !== tag)
                .map((t) => (
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
                {expensesWithTag(merge) === 0 ? "num gasto que está na lixeira" : `em ${plural(expensesWithTag(merge), "gasto")}`}.
                Renomear <strong>funde as duas</strong>: {plural(expenses, "gasto")} de #{tag} passam para #{merge}, e #{tag}{" "}
                deixa de existir. Depois nada diz de qual nome cada gasto veio.
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
