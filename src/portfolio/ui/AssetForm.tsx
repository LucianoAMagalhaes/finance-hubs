"use client";

import { useState, type FormEvent } from "react";
import { ASSET_CLASSES, BOND_TYPES, INDEXERS, normalizeTicker, type Asset, type AssetClass, type AssetToSave } from "@/portfolio/domain";
import type { CryptoCandidate } from "@/portfolio/sources";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { assetDraftFrom, checkAssetDraft, emptyAssetDraft, RATE_AFFIXES, type AssetDraft } from "./assetDraft";
import { BOND_TYPE_NAMES, INDEXER_NAMES } from "./parts";

type Props = {
  /** The asset being corrected, or null for a new one. */
  asset: Asset | null;
  /** The class the sheet proposes to a new asset: the open one. */
  proposedClass: AssetClass | null;
  /** Returns the refusal, the coins to choose from, or null if it saved. */
  save: (asset: AssetToSave) => Promise<string | CryptoCandidate[] | null>;
  close: () => void;
};

/**
 * A new asset, by its ticker and class, before or without any buy; or the
 * correction of its ticker, when the company changes it. Either way the source
 * checks the ticker, and a crypto ticker several coins share asks which one.
 * In Renda Fixa, a private bond by its name, as typed, its type, indexer, rate
 * and maturity, all correctable; no source is asked. The Tesouro Direto comes
 * with its own ticket.
 */
export function AssetForm({ asset, proposedClass, save, close }: Props) {
  const [draft, setDraft] = useState<AssetDraft>(() =>
    asset ? assetDraftFrom(asset) : emptyAssetDraft(proposedClass ?? ASSET_CLASSES[0].id),
  );
  /** The coins sharing the ticker, once the source said there are several. */
  const [coins, setCoins] = useState<CryptoCandidate[] | null>(null);
  const [coin, setCoin] = useState<string | null>(null);
  const { run, running, refusal, refuse, clearRefusal } = useAction();
  const fixedIncome = draft.assetClass === "fixed-income";

  function edit(change: Partial<AssetDraft>) {
    clearRefusal();
    setCoins(null);
    setCoin(null);
    setDraft((d) => ({ ...d, ...change }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (coins && !coin) return refuse("Escolha uma das criptos.");
    const checked = checkAssetDraft(draft, asset?.id ?? null);
    if (checked.error) return refuse(checked.error);
    await run(async () => {
      const outcome = await save(fixedIncome ? checked.asset : { ...checked.asset, sourceId: coin });
      if (!Array.isArray(outcome)) return outcome;
      setCoins(outcome);
      return null;
    });
  }

  const affixes = RATE_AFFIXES[draft.indexer];
  return (
    <Sheet labelledBy="asset-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="asset-title">
            {asset ? (asset.bond ? `Corrigir ${asset.ticker}` : `Corrigir o código de ${asset.ticker}`) : "Novo ativo"}
          </h2>
          <p className="hint">
            {fixedIncome
              ? asset
                ? "A correção do indexador ou da taxa vale para o título inteiro, desde a primeira aplicação."
                : "Pelo nome que o banco usa. O jeito do título não muda depois."
              : asset
                ? "Quando a empresa troca de código. O ativo continua com as suas operações e proventos. A fonte confere o código."
                : "Pelo código de negociação. A classe não muda depois, e o ativo pode existir antes da primeira compra. A fonte confere o código."}
          </p>
        </header>
        <div className="content">
          <label className="field">
            <span>Classe</span>
            <select
              value={draft.assetClass}
              disabled={asset !== null}
              title={asset ? "A classe não muda depois do cadastro" : undefined}
              onChange={(e) => edit({ assetClass: e.target.value as AssetClass })}
            >
              {ASSET_CLASSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {fixedIncome ? (
            <>
              <div className="shape-picker" role="group" aria-label="Jeito do título">
                <button type="button" aria-pressed={false} disabled title="Ainda não existe">
                  Tesouro Direto
                </button>
                <button type="button" aria-pressed={draft.bondKind === "private-bond"} disabled={asset !== null}>
                  Título privado
                </button>
              </div>
              <label className="field">
                <span>Nome</span>
                <input
                  required
                  autoFocus
                  value={draft.ticker}
                  onChange={(e) => edit({ ticker: e.target.value })}
                  placeholder="Ex.: CDB Inter 2028"
                />
              </label>
              <div className="cols-2">
                <label className="field">
                  <span>Tipo</span>
                  <select value={draft.bondType} onChange={(e) => edit({ bondType: e.target.value as AssetDraft["bondType"] })}>
                    {BOND_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {BOND_TYPE_NAMES[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Indexador</span>
                  <select value={draft.indexer} onChange={(e) => edit({ indexer: e.target.value as AssetDraft["indexer"] })}>
                    {INDEXERS.map((i) => (
                      <option key={i} value={i}>
                        {INDEXER_NAMES[i]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="cols-2">
                <label className="field">
                  <span>Taxa</span>
                  <span className="affixed">
                    {affixes.before && <span className="affix">{affixes.before}</span>}
                    <input
                      required
                      inputMode="decimal"
                      className="num"
                      value={draft.rate}
                      onChange={(e) => edit({ rate: e.target.value })}
                      placeholder={affixes.example}
                    />
                    <span className="affix">{affixes.after}</span>
                  </span>
                </label>
                <label className="field">
                  <span>Vencimento</span>
                  <input type="date" required value={draft.maturityDate} onChange={(e) => edit({ maturityDate: e.target.value })} />
                </label>
              </div>
            </>
          ) : (
            <label className="field">
              <span>Código</span>
              <input
                required
                autoFocus
                autoCapitalize="characters"
                value={draft.ticker}
                onChange={(e) => edit({ ticker: e.target.value })}
                placeholder="Ex.: PETR4, AAPL, HGLG11, BTC"
              />
            </label>
          )}
          {coins && (
            <fieldset className="coin-choice">
              <legend>Mais de uma cripto usa o código {normalizeTicker(draft.ticker, "crypto")}. Qual é a sua?</legend>
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
            {running ? (fixedIncome ? "Salvando…" : "Conferindo…") : asset ? "Salvar" : "Cadastrar"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
