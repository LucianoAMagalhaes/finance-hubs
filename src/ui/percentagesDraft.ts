import { JARS, sumPercentages, validatePercentages, type Percentages, type Jar, type JarGroup } from "@/domain";

/** What is written in each field, as the person typed it. */
export type Draft = Record<Jar, string>;

/** The draft starts with the percentages the month shows, its own or inherited. */
export function draftFrom(jars: JarGroup[]): Draft {
  return Object.fromEntries(jars.map((j) => [j.key, String(j.percentage)])) as Draft;
}

/** For the live projection: what does not read as a number counts as zero, and nothing leaves 0 to 100. */
export function previewPercentages(draft: Draft): Percentages {
  const read = readDraft(draft);
  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
  return Object.fromEntries(JARS.map((jar) => [jar.id, clamp(read[jar.id])])) as Percentages;
}

/**
 * What the editor shows and sends: the percentages as the person wrote them,
 * their validation error, and the sum — the preview's, which counts each field
 * as the projection counts it.
 */
export type CheckedDraft = { percentages: Percentages; error: string | null; sum: number };

export function checkDraft(draft: Draft): CheckedDraft {
  const percentages = readDraft(draft);
  return { percentages, error: validatePercentages(percentages), sum: sumPercentages(previewPercentages(draft)) };
}

/** The draft's percentages; a blank or unreadable field becomes NaN, which validation refuses. */
function readDraft(draft: Draft): Percentages {
  return Object.fromEntries(
    JARS.map((j) => [j.id, draft[j.id].trim() === "" ? NaN : Number(draft[j.id])]),
  ) as Percentages;
}
