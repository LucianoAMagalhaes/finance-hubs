"use client";

import type { FormEvent } from "react";
import type { Asset } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";

type Props = {
  asset: Asset;
  /** Returns the refusal, or null if it deleted. */
  delete: () => Promise<string | null>;
  close: () => void;
};

/**
 * Deletes for good an asset registered by mistake. The domain refuses an
 * asset with any trade or payout, and the refusal stays here, on the sheet.
 */
export function DeleteAssetForm({ asset, delete: remove, close }: Props) {
  const { run, running, refusal } = useAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(remove);
  }

  return (
    <Sheet labelledBy="delete-asset-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="delete-asset-title">Apagar {asset.ticker}</h2>
          <p className="hint">Apaga de vez, sem lixeira. Só um ativo sem nenhuma operação nem provento pode ser apagado.</p>
        </header>
        <div className="content">
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            Apagar
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
