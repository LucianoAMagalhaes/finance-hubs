import { isValidDate, type IsoDate, type Result } from "@/shared";
import type { Decimal } from "./decimal";
import type { PortfolioState } from "./state";

/** The official daily CDI rate, in percent, as an exact decimal of 8 places. */
export type RateIndex = { kind: "cdi"; date: IsoDate; rate: Decimal };

/** Merges what the source brought; a repeated kind and date replaces the previous rate. */
export function recordRateIndexes(state: PortfolioState, rateIndexes: RateIndex[]): Result<PortfolioState> {
  if (!Array.isArray(rateIndexes)) return { ok: false, error: "Informe os índices." };
  for (const r of rateIndexes) {
    if (r?.kind !== "cdi") return { ok: false, error: "Escolha um índice válido." };
    if (typeof r.date !== "string" || !isValidDate(r.date)) return { ok: false, error: "Informe uma data válida para o índice." };
    if (!Number.isSafeInteger(r.rate)) return { ok: false, error: "A taxa do índice aceita até 8 casas decimais." };
    if (r.rate < 0) return { ok: false, error: "A taxa do índice não pode ser negativa." };
  }
  const kept = new Map(state.rateIndexes.map((r) => [`${r.kind}:${r.date}`, r]));
  for (const { kind, date, rate } of rateIndexes) kept.set(`${kind}:${date}`, { kind, date, rate });
  return { ok: true, value: { ...state, rateIndexes: [...kept.values()].sort((a, b) => a.date.localeCompare(b.date)) } };
}
