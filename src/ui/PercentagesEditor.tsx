"use client";

import { type FormEvent } from "react";
import { JARS, type Percentages } from "@/domain";
import { checkDraft, type Draft } from "./percentagesDraft";
import { Refusal, jarColor } from "./parts";
import { useAction } from "./useAction";

type Props = {
  draft: Draft;
  change: (draft: Draft) => void;
  /** Returns the error, or null if it saved. */
  save: (percentages: Percentages) => Promise<string | null>;
  cancel: () => void;
};

/**
 * The month's six percentages. It sits on the screen, next to the jars,
 * because each keystroke recalculates limits, "Não alocado" and verdicts right
 * there.
 */
export function PercentagesEditor({ draft, change, save, cancel }: Props) {
  // Two errors, from two places: the draft's is a pure function of what is typed,
  // and exists before any action; the refusal comes back from one.
  const { run, running, refusal, clearRefusal } = useAction();
  const { percentages, error, sum } = checkDraft(draft);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (error) return;
    await run(() => save(percentages));
  }

  return (
    <form className="card percentages-editor" onSubmit={submit} aria-label="Percentuais do mês">
      <div className="percentage-fields">
        {JARS.map((j) => (
          <label className="field" key={j.id} style={jarColor(j.id)}>
            <span>
              <span className="swatch" />
              {j.name}
            </span>
            <span className="with-suffix">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                className="num"
                value={draft[j.id]}
                onChange={(e) => {
                  clearRefusal();
                  change({ ...draft, [j.id]: e.target.value });
                }}
              />
              %
            </span>
          </label>
        ))}
      </div>
      <div className="editor-foot">
        <span className={`sum num ${sum > 100 ? "over" : ""}`}>Soma {sum}%</span>
        <button type="button" className="btn" onClick={cancel}>
          Cancelar
        </button>
        <button type="submit" className="btn primary" disabled={error !== null || running}>
          Salvar
        </button>
      </div>
      <Refusal refusal={refusal ?? error} />
    </form>
  );
}
