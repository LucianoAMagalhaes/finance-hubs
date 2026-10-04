"use client";

import { useState, type FormEvent } from "react";
import type { AssetView } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { draftFrom, readDraft } from "./scoreDraft";

type Props = {
  asset: AssetView;
  save: (score: number) => Promise<string | null>;
  close: () => void;
};

export function ScoreForm({ asset, save, close }: Props) {
  const [draft, setDraft] = useState(() => draftFrom(asset.score));
  const { run, running, refusal, refuse, clearRefusal } = useAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = readDraft(draft);
    if (!result.ok) { refuse(result.error); return; }
    await run(() => save(result.value));
  }

  return (
    <Sheet labelledBy="score-title" close={close}>
      <form onSubmit={submit} noValidate>
        <header>
          <h2 id="score-title">Avaliar {asset.ticker}</h2>
          <p className="hint">Informe uma nota inteira de 0 a 10. Salvar atualiza a data da avaliação.</p>
        </header>
        <div className="content">
          <label className="field">
            <span>Nota</span>
            <input type="text" inputMode="numeric" autoFocus className="num" value={draft.score} disabled={running}
              onChange={(e) => { clearRefusal(); setDraft({ score: e.target.value }); }} />
          </label>
          <p className="hint">Nota zero não muda sua posição, seu valor atual ou seu ganho total.</p>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" onClick={close} disabled={running}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={running}>Salvar</button>
        </footer>
      </form>
    </Sheet>
  );
}
