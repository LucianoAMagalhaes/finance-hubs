"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ASSET_CLASSES, BOND_TYPES, INDEXERS, formatDate, normalizeTicker, type Asset, type AssetClass, type AssetToSave } from "@/portfolio/domain";
import type { CryptoCandidate, TreasuryBondQuote } from "@/portfolio/sources";
import { listTreasuryBonds } from "@/portfolio/server/actions";
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
 * and maturity, all correctable. A Tesouro Direto bond is chosen from the
 * source list, with its name, maturity and source id.
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
  const treasury = fixedIncome && draft.bondKind === "treasury-bond";
  const [bonds, setBonds] = useState<TreasuryBondQuote[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [listAttempt, setListAttempt] = useState(0);
  useEffect(() => {
    if (!treasury || asset) return;
    let active = true;
    setListFailed(false);
    setBonds(null);
    listTreasuryBonds().then((answer) => {
      if (!active) return;
      setBonds(answer);
      setListFailed(answer === null);
    }).catch(() => { if (active) setListFailed(true); });
    return () => { active = false; };
  }, [treasury, asset, listAttempt]);

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
            {treasury
              ? "Escolha o título pela lista do Tesouro Direto."
              : fixedIncome
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
                <button
                  type="button"
                  aria-pressed={treasury}
                  disabled={asset !== null}
                  onClick={() => edit({ bondKind: "treasury-bond", ticker: "", sourceId: null, maturityDate: "" })}
                >
                  Tesouro Direto
                </button>
                <button
                  type="button"
                  aria-pressed={draft.bondKind === "private-bond"}
                  disabled={asset !== null}
                  onClick={() => edit({ bondKind: "private-bond", ticker: "", sourceId: null, maturityDate: "" })}
                >
                  Título privado
                </button>
              </div>
              {treasury ? (
                asset ? <p>{asset.ticker} · vence {formatDate(asset.bond!.maturityDate)}</p> : listFailed ? (
                  <div role="alert">
                    <p>A lista do Tesouro Direto não veio.</p>
                    <button type="button" className="btn" onClick={() => setListAttempt((attempt) => attempt + 1)}>Tentar de novo</button>
                  </div>
                ) : bonds === null ? <p role="status">Buscando títulos…</p> : (
                  <label className="field">
                    <span>Título do Tesouro Direto</span>
                    <select required value={draft.sourceId ?? ""} onChange={(event) => {
                      const selected = bonds.find((bond) => bond.sourceId === event.target.value);
                      edit({ sourceId: selected?.sourceId ?? null, ticker: selected?.name ?? "", maturityDate: selected?.maturityDate ?? "" });
                    }}>
                      <option value="">Escolha um título</option>
                      {bonds.map((bond) => <option key={bond.sourceId} value={bond.sourceId}>{bond.name} · vence {formatDate(bond.maturityDate)}</option>)}
                    </select>
                  </label>
                )
              ) : (
                <>
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
              )}
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
          <button type="submit" className="btn primary" disabled={running || (treasury && !draft.sourceId)}>
            {running ? (fixedIncome ? "Salvando…" : "Conferindo…") : asset ? "Salvar" : "Cadastrar"}
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
