import { isValidDate, type IsoDate, type Result } from "@/shared";
import type { Decimal } from "./decimal";
import type { PortfolioState } from "./state";

/** Percent scaled to 8 places: daily CDI, or monthly IPCA dated on the month's first day. */
export type RateIndex = { kind: "cdi" | "ipca" | "ipca-projection"; date: IsoDate; rate: Decimal };

/** Merges what the source brought; a repeated kind and date replaces the previous rate. */
export function recordRateIndexes(state: PortfolioState, rateIndexes: RateIndex[]): Result<PortfolioState> {
  if (!Array.isArray(rateIndexes)) return { ok: false, error: "Informe os índices." };
  for (const r of rateIndexes) {
    if (!["cdi", "ipca", "ipca-projection"].includes(r?.kind)) return { ok: false, error: "Escolha um índice válido." };
    if (typeof r.date !== "string" || !isValidDate(r.date)) return { ok: false, error: "Informe uma data válida para o índice." };
    if (!Number.isSafeInteger(r.rate)) return { ok: false, error: "A taxa do índice aceita até 8 casas decimais." };
    if (r.kind !== "cdi" && !r.date.endsWith("-01")) return { ok: false, error: "Informe o primeiro dia do mês do IPCA." };
    if (r.kind === "cdi" && r.rate < 0) return { ok: false, error: "A taxa do índice não pode ser negativa." };
    if (r.rate <= -10_000_000_000) return { ok: false, error: "A variação do IPCA deve ser maior que -100%." };
  }
  const kept = new Map(state.rateIndexes.map((r) => [`${r.kind}:${r.date}`, r]));
  for (const { kind, date, rate } of rateIndexes) kept.set(`${kind}:${date}`, { kind, date, rate });
  for (const r of kept.values()) if (r.kind === "ipca") kept.delete(`ipca-projection:${r.date}`);
  return { ok: true, value: { ...state, rateIndexes: [...kept.values()].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)) } };
}
