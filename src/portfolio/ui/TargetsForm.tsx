"use client";

import { useState, type FormEvent } from "react";
import { ASSET_CLASSES, type Targets } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { checkDraft, draftFrom, type Draft } from "./targetsDraft";
import { classColor } from "./parts";

type Props = {
  targets: Targets;
  /** Returns the refusal, or null if it saved. */
  save: (targets: Targets) => Promise<string | null>;
  close: () => void;
};

/**
 * The five targets together, in a sheet. The sum shows how far it is from 100
 * as the person types; a refusal, the browser's or the server's, stays in the
 * sheet next to what was typed.
 */
export function TargetsForm({ targets, save, close }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(targets));
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const checked = checkDraft(draft);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // The same refusal the server would give, without the trip.
    if (checked.error) {
      refuse(checked.error);
      return;
    }
    await run(() => save(checked.targets));
  }

  return (
    <Sheet labelledBy="targets-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="targets-title">Alvos das classes</h2>
          <p className="hint">A fatia da carteira que você quer em cada classe: inteiros de 0 a 100, somando exatamente 100.</p>
        </header>
        <div className="content">
          {ASSET_CLASSES.map((c) => (
            <label className="field target-field" key={c.id} style={classColor(c.id)}>
              <span>
                <span className="swatch" />
                {c.name}
              </span>
              <span className="with-suffix">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  className="num"
                  value={draft[c.id]}
                  onChange={(e) => {
                    clearRefusal();
                    setDraft({ ...draft, [c.id]: e.target.value });
                  }}
                />
                %
              </span>
            </label>
          ))}
          <p className={`targets-sum num ${checked.closes ? "" : "off"}`} aria-live="polite">
            {checked.sum}
          </p>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            Salvar
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
