"use client";

import { useState, type FormEvent } from "react";
import { ASSET_CLASSES, normalizeTicker, REGISTRABLE_CLASSES, type Asset, type AssetClass, type AssetToSave } from "@/portfolio/domain";
import type { CryptoCandidate } from "@/portfolio/sources";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";

type Props = {
  /** The asset whose ticker is being corrected, or null for a new one. */
  asset: Asset | null;
  /** The class the sheet proposes to a new asset: the open one, when it can be registered. */
  proposedClass: AssetClass | null;
  /** Returns the refusal, the coins to choose from, or null if it saved. */
  save: (asset: AssetToSave) => Promise<string | CryptoCandidate[] | null>;
  close: () => void;
};

/**
 * A new asset, by its ticker and class, before or without any buy; or the
 * correction of its ticker, when the company changes it. Either way the source
 * checks the ticker, and a crypto ticker several coins share asks which one.
 */
export function AssetForm({ asset, proposedClass, save, close }: Props) {
  const [ticker, setTicker] = useState(asset?.ticker ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(
    asset?.assetClass ?? (proposedClass && REGISTRABLE_CLASSES.includes(proposedClass) ? proposedClass : REGISTRABLE_CLASSES[0]!),
  );
  /** The coins sharing the ticker, once the source said there are several. */
  const [coins, setCoins] = useState<CryptoCandidate[] | null>(null);
  const [coin, setCoin] = useState<string | null>(null);
  const { run, running, refusal, refuse, clearRefusal } = useAction();

  function edit(change: () => void) {
    clearRefusal();
    setCoins(null);
    setCoin(null);
    change();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (coins && !coin) return refuse("Escolha uma das criptos.");
    await run(async () => {
      const outcome = await save({ id: asset?.id, ticker, assetClass, sourceId: coin });
      if (!Array.isArray(outcome)) return outcome;
      setCoins(outcome);
      return null;
    });
  }

  return (
    <Sheet labelledBy="asset-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="asset-title">{asset ? `Corrigir o código de ${asset.ticker}` : "Novo ativo"}</h2>
          <p className="hint">
            {asset
              ? "Quando a empresa troca de código. O ativo continua com as suas operações e proventos."
              : "Pelo código de negociação. A classe não muda depois, e o ativo pode existir antes da primeira compra."}{" "}
            A fonte confere o código.
          </p>
        </header>
        <div className="content">
          <label className="field">
            <span>Código</span>
            <input
              required
              autoFocus
              autoCapitalize="characters"
              value={ticker}
              onChange={(e) => edit(() => setTicker(e.target.value))}
              placeholder="Ex.: PETR4, AAPL, HGLG11, BTC"
            />
          </label>
          <label className="field">
            <span>Classe</span>
            <select
              value={assetClass}
              disabled={asset !== null}
              title={asset ? "A classe não muda depois do cadastro" : undefined}
              onChange={(e) => edit(() => setAssetClass(e.target.value as AssetClass))}
            >
              {ASSET_CLASSES.filter((c) => c.id === assetClass || (!asset && REGISTRABLE_CLASSES.includes(c.id))).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {coins && (
            <fieldset className="coin-choice">
              <legend>Mais de uma cripto usa o código {normalizeTicker(ticker)}. Qual é a sua?</legend>
              {coins.map((c) => (
                <label key={c.id}>
                  <input
                    type="radio"
                    name="coin"
                    value={c.id}
                    checked={coin === c.id}
                    onChange={() => {
                      clearRefusal();
                      setCoin(c.id);
                    }}
                  />
                  <span>{c.name}</span>
                  <span className="rank num">{c.rank === null ? "sem posição no ranking" : `nº ${c.rank} no ranking`}</span>
                </label>
              ))}
            </fieldset>
          )}
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={running}>
            {running ? "Conferindo…" : asset ? "Salvar" : "Cadastrar"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
