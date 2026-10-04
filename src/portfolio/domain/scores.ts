import type { IsoDate, Result } from "@/shared";
import type { PortfolioState } from "./state";

/** Only the current manual score and the date the person last entered it. */
export type ManualScore = { asset: number; score: number; evaluatedAt: IsoDate };

export function saveScore(state: PortfolioState, assetId: number, score: number, today: IsoDate): Result<PortfolioState> {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) return { ok: false, error: "Esse ativo não existe." };
  if (asset.assetClass !== "crypto" && asset.assetClass !== "fixed-income") {
    return { ok: false, error: "Essa classe usa questionário e não aceita nota digitada." };
  }
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return { ok: false, error: "Informe uma nota inteira de 0 a 10." };
  }
  const current = { asset: assetId, score, evaluatedAt: today };
  const scores = state.scores.some((s) => s.asset === assetId)
    ? state.scores.map((s) => s.asset === assetId ? current : s)
    : [...state.scores, current];
  return { ok: true, value: { ...state, scores } };
}
