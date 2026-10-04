import { reaisToCents, validateContribution, type Cents, type Result } from "@/portfolio/domain";

export type Draft = { contribution: string };

/** Reads the amount in reais, retaining the original draft on refusal. */
export function readDraft(draft: Draft): Result<Cents> {
  const amount = reaisToCents(draft.contribution);
  const error = validateContribution(amount ?? NaN);
  return error ? { ok: false, error } : { ok: true, value: amount! };
}
