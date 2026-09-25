import { apply, normalizeTicker, type AssetToSave, type IsoDate, type PortfolioState } from "@/portfolio/domain";
import type { CryptoCandidate, Sources } from "./port";

/**
 * What the source says of the asset being registered or corrected: the asset
 * to save, with its id at the source; the refusal, in Portuguese; or, for a
 * crypto ticker several coins share, the coins for the person to choose from.
 */
export type AssetCheck = { ok: true; asset: AssetToSave } | { ok: false; error: string } | { ok: false; choose: CryptoCandidate[] };

/**
 * Asks the source whether it knows the ticker, before the registration or its
 * correction; it never writes. What the domain would refuse is refused first,
 * with no source asked. A ticker the source doesn't know is refused. With the
 * source down the asset is accepted, and stays with no quote until a fetch
 * brings one. It keeps the id it had only while its ticker stays the same: a
 * new ticker's id is never the old one's.
 */
export async function checkAsset(state: PortfolioState, asset: AssetToSave, sources: Sources, today: IsoDate): Promise<AssetCheck> {
  const saved = apply(state, { type: "save-asset", asset }, today);
  if (!saved.ok) return saved;

  const ticker = normalizeTicker(asset.ticker);
  const current = state.assets.find((a) => a.id === asset.id);
  const keptSourceId = current?.ticker === ticker ? current.sourceId : null;
  const accept = (sourceId: string | null): AssetCheck => ({ ok: true, asset: { ...asset, ticker, sourceId } });
  const unknown = (source: string): AssetCheck => ({
    ok: false,
    error: `${source} não conhece o código ${ticker}: confira se ele foi digitado certo.`,
  });

  switch (asset.assetClass) {
    case "domestic-stocks":
    case "real-estate-funds": {
      const sourced = { ticker, assetClass: asset.assetClass };
      const exists = await sources.tickerExists(sourced).catch(orFallback(ticker, null));
      if (exists === null) return accept(keptSourceId);
      if (!exists) return unknown("O Yahoo Finance");
      return accept(await sources.isin(sourced).catch(orFallback(ticker, keptSourceId)));
    }
    case "crypto": {
      // The coin chosen from the list, or the one the asset had.
      const chosen = asset.sourceId ?? keptSourceId;
      const coins = await sources.searchCrypto(ticker).catch(orFallback(ticker, null));
      if (coins === null) return accept(chosen);
      if (coins.length === 0) return unknown("A CoinGecko");
      if (coins.some((c) => c.id === chosen)) return accept(chosen);
      if (coins.length === 1) return accept(coins[0]!.id);
      return { ok: false, choose: coins };
    }
    default:
      return accept(keptSourceId);
  }
}

/** A source that failed stands for what the check falls back on; the failure goes to the log. */
const orFallback =
  <T>(ticker: string, fallback: T) =>
  (error: unknown): T => {
    console.warn(`No check of ${ticker} at the source:`, error);
    return fallback;
  };
