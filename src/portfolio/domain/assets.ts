import type { Result } from "@/shared";
import { checkBond, type Bond } from "./bonds";
import { ASSET_CLASSES, type AssetClass } from "./classes";
import { nextId, type PortfolioState } from "./state";
import { whyUncovered } from "./trades";
import { whyUnrepresentableTrade } from "./privateBonds";

/**
 * Something the person invests in or wants to, by its ticker and class. It
 * exists before the first buy. The class is chosen once and never changes.
 * `sourceId` is how the source knows it, when the source said so at the
 * registration: the ISIN in the B3's classes, which tells PETR3 from PETR4,
 * and the CoinGecko id in crypto. The person keeps seeing the ticker. In
 * Renda Fixa the ticker is the bond's name, and `bond` is only there.
 */
export type Asset = { id: number; ticker: string; assetClass: AssetClass; sourceId: string | null; bond?: Bond };

/** Without `id`, a new asset; with it, the correction of that one. */
export type AssetToSave = { id?: number; ticker: string; assetClass: AssetClass; sourceId?: string | null; bond?: Bond };

/**
 * The ticker as it is kept: in capitals, like the exchange writes it. A
 * bond's name is kept as typed, only without the surrounding spaces.
 */
export const normalizeTicker = (ticker: string, assetClass: AssetClass) =>
  assetClass === "fixed-income" ? ticker.trim() : ticker.trim().toUpperCase();

/** Two tickers or names are the same regardless of case. */
const sameTicker = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/**
 * Creates the asset, or corrects its ticker and source's id. Checks every
 * field, because the command comes from the browser. Whether the source knows
 * the ticker is asked before, outside the domain.
 */
export function saveAsset(state: PortfolioState, data: AssetToSave): Result<PortfolioState> {
  if (!ASSET_CLASSES.some((c) => c.id === data?.assetClass)) return { ok: false, error: "Escolha a classe do ativo." };
  const fixedIncome = data.assetClass === "fixed-income";
  const ticker = typeof data.ticker === "string" ? normalizeTicker(data.ticker, data.assetClass) : "";
  if (!ticker) return { ok: false, error: fixedIncome ? "Informe o nome do título." : "Informe o código do ativo." };
  const sourceId = data.sourceId ?? null;
  if (sourceId !== null && (typeof sourceId !== "string" || !sourceId.trim())) {
    return { ok: false, error: "O identificador do ativo na fonte é inválido." };
  }

  const existing = data.id === undefined ? null : state.assets.find((a) => a.id === data.id);
  if (existing === undefined) return { ok: false, error: "Esse ativo não existe." };
  if (existing && existing.assetClass !== data.assetClass) {
    return { ok: false, error: "A classe de um ativo não muda depois do cadastro." };
  }
  if (!fixedIncome && data.bond !== undefined) return { ok: false, error: "Só um ativo de Renda Fixa é um título." };
  const checked = fixedIncome ? checkBond(data.bond!, existing?.bond) : null;
  if (checked && "error" in checked) return { ok: false, error: checked.error };
  if (state.assets.some((a) => sameTicker(a.ticker, ticker) && a.id !== existing?.id)) {
    return { ok: false, error: `Já existe um ativo ${ticker} na carteira.` };
  }

  const asset: Asset = {
    id: existing?.id ?? nextId(state.assets),
    ticker,
    assetClass: data.assetClass,
    sourceId,
    ...(checked && { bond: checked.bond }),
  };
  const assets = existing ? state.assets.map((a) => (a.id === asset.id ? asset : a)) : [...state.assets, asset];
  const next = { ...state, assets };
  if (asset.bond && state.trades.some((t) => t.asset === asset.id && t.kind === "buy" && t.date >= asset.bond!.maturityDate)) {
    return { ok: false, error: "O vencimento precisa ser depois de todas as compras ou aplicações do título." };
  }
  const unrepresentable = whyUnrepresentableTrade(next, asset.id);
  if (unrepresentable) return { ok: false, error: unrepresentable };
  const uncovered = whyUncovered(next, [asset.id], null);
  if (uncovered) return { ok: false, error: uncovered };
  return { ok: true, value: next };
}

/**
 * Deletes for good an asset registered by mistake, with its corporate
 * actions, which change nothing without a trade. An asset with any trade or
 * payout is never deleted nor hidden: the gain it gave stays in the portfolio.
 */
export function deleteAsset(state: PortfolioState, id: number): Result<PortfolioState> {
  const asset = state.assets.find((a) => a.id === id);
  if (!asset) return { ok: false, error: "Esse ativo não existe." };
  if (state.trades.some((t) => t.asset === id)) {
    return { ok: false, error: `${asset.ticker} tem operações: um ativo com histórico fica na carteira para sempre.` };
  }
  if (state.payouts.some((p) => p.asset === id)) {
    return { ok: false, error: `${asset.ticker} tem proventos: um ativo com histórico fica na carteira para sempre.` };
  }
  const assets = state.assets.filter((a) => a.id !== id);
  const quotes = state.quotes.filter((q) => q.asset !== id);
  return {
    ok: true,
    value: {
      ...state,
      assets,
      quotes,
      corporateActions: state.corporateActions.filter((c) => c.asset !== id),
      payoutOrigins: state.payoutOrigins.filter((o) => o.asset !== id),
    },
  };
}
