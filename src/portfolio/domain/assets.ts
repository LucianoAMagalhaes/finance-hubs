import type { Result } from "@/shared";
import { ASSET_CLASSES, type AssetClass } from "./classes";
import { nextId, type PortfolioState } from "./state";

/**
 * Something the person invests in or wants to, by its ticker and class. It
 * exists before the first buy. The class is chosen once and never changes.
 * `sourceId` is how the source knows it, when the source said so at the
 * registration: the ISIN in the B3's classes, which tells PETR3 from PETR4,
 * and the CoinGecko id in crypto. The person keeps seeing the ticker.
 */
export type Asset = { id: number; ticker: string; assetClass: AssetClass; sourceId: string | null };

/** Without `id`, a new asset; with it, the correction of that one. */
export type AssetToSave = { id?: number; ticker: string; assetClass: AssetClass; sourceId?: string | null };

/**
 * The classes `+ Ativo` offers today. Renda Fixa has its own registration,
 * and Ações Internacionais arrive with the dollar.
 */
export const REGISTRABLE_CLASSES: readonly AssetClass[] = ["domestic-stocks", "real-estate-funds", "crypto"];

export const normalizeTicker = (ticker: string) => ticker.trim().toUpperCase();

/**
 * Creates the asset, or corrects its ticker and source's id. Checks every
 * field, because the command comes from the browser. Whether the source knows
 * the ticker is asked before, outside the domain.
 */
export function saveAsset(state: PortfolioState, data: AssetToSave): Result<PortfolioState> {
  const ticker = typeof data?.ticker === "string" ? normalizeTicker(data.ticker) : "";
  if (!ticker) return { ok: false, error: "Informe o código do ativo." };
  if (!ASSET_CLASSES.some((c) => c.id === data.assetClass)) return { ok: false, error: "Escolha a classe do ativo." };
  const sourceId = data.sourceId ?? null;
  if (sourceId !== null && (typeof sourceId !== "string" || !sourceId.trim())) {
    return { ok: false, error: "O identificador do ativo na fonte é inválido." };
  }

  const existing = data.id === undefined ? null : state.assets.find((a) => a.id === data.id);
  if (existing === undefined) return { ok: false, error: "Esse ativo não existe." };
  if (existing && existing.assetClass !== data.assetClass) {
    return { ok: false, error: "A classe de um ativo não muda depois do cadastro." };
  }
  if (!existing && data.assetClass === "fixed-income") {
    return { ok: false, error: "Os títulos de Renda Fixa têm cadastro próprio, que ainda não existe." };
  }
  if (!existing && data.assetClass === "international-stocks") {
    return { ok: false, error: "As Ações Internacionais chegam com o dólar e ainda não podem ser cadastradas." };
  }
  if (state.assets.some((a) => a.ticker === ticker && a.id !== existing?.id)) {
    return { ok: false, error: `Já existe um ativo ${ticker} na carteira.` };
  }

  const asset: Asset = { id: existing?.id ?? nextId(state.assets), ticker, assetClass: data.assetClass, sourceId };
  const assets = existing ? state.assets.map((a) => (a.id === asset.id ? asset : a)) : [...state.assets, asset];
  return { ok: true, value: { ...state, assets } };
}

/**
 * Deletes for good an asset registered by mistake. An asset with any trade
 * or payout is never deleted nor hidden: the gain it gave stays in the portfolio.
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
  return { ok: true, value: { ...state, assets, quotes: state.quotes.filter((q) => q.asset !== id) } };
}
