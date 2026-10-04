import type { Result } from "@/portfolio/domain";

export type Draft = { score: string };
export const draftFrom = (score: number | null): Draft => ({ score: score === null ? "" : String(score) });

/** Reads whole decimal digits without treating blank text as zero. */
export function readDraft(draft: Draft): Result<number> {
  const text = draft.score.trim();
  const score = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(score) || score < 0 || score > 10) {
    return { ok: false, error: "Informe uma nota inteira de 0 a 10." };
  }
  return { ok: true, value: score };
}
