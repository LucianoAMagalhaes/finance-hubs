"use client";

import { useState, type FormEvent } from "react";
import { ASSET_CLASSES, REGISTRABLE_CLASSES, type AssetClass, type AssetToSave } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";

type Props = {
  /** The class the sheet proposes: the open one, when it can be registered. */
  proposedClass: AssetClass | null;
  /** Returns the refusal, or null if it saved. */
  save: (asset: AssetToSave) => Promise<string | null>;
  close: () => void;
};

/** A new asset, by its ticker and class, before or without any buy. */
export function AssetForm({ proposedClass, save, close }: Props) {
  const [ticker, setTicker] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>(
    proposedClass && REGISTRABLE_CLASSES.includes(proposedClass) ? proposedClass : REGISTRABLE_CLASSES[0]!,
  );
  const { run, running, refusal, clearRefusal } = useAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(() => save({ ticker, assetClass }));
  }

  return (
    <Sheet labelledBy="asset-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="asset-title">Novo ativo</h2>
          <p className="hint">Pelo código de negociação. A classe não muda depois, e o ativo pode existir antes da primeira compra.</p>
        </header>
        <div className="content">
          <label className="field">
            <span>Código</span>
            <input
              required
              autoFocus
              autoCapitalize="characters"
              value={ticker}
              onChange={(e) => {
                clearRefusal();
                setTicker(e.target.value);
              }}
              placeholder="Ex.: PETR4, HGLG11, BTC"
            />
          </label>
          <label className="field">
            <span>Classe</span>
            <select
              value={assetClass}
              onChange={(e) => {
                clearRefusal();
                setAssetClass(e.target.value as AssetClass);
              }}
            >
              {ASSET_CLASSES.filter((c) => REGISTRABLE_CLASSES.includes(c.id)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            Cadastrar
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
