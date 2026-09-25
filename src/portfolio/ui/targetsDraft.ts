import { ASSET_CLASSES, validateTargets, type AssetClass, type Targets } from "@/portfolio/domain";

/** What is written in each field, as the person typed it. */
export type Draft = Record<AssetClass, string>;

export function draftFrom(targets: Targets): Draft {
  return Object.fromEntries(ASSET_CLASSES.map((c) => [c.id, String(targets[c.id])])) as Draft;
}

/**
 * What the sheet shows and sends: the targets as the person wrote them, the
 * domain's refusal of them, the sum with how far it is from 100, and whether it closes at 100.
 */
export type CheckedDraft = { targets: Targets; error: string | null; sum: string; closes: boolean };

export function checkDraft(draft: Draft): CheckedDraft {
  const targets = readDraft(draft);
  // What doesn't read as a number counts as zero in the sum: the error already names it.
  const sum = ASSET_CLASSES.reduce((s, c) => s + (Number.isFinite(targets[c.id]) ? targets[c.id] : 0), 0);
  const gap = 100 - sum;
  const status = gap > 0 ? ` · ${gap === 1 ? "falta" : "faltam"} ${gap}` : gap < 0 ? ` · passa ${-gap}` : "";
  return { targets, error: validateTargets(targets), sum: `Soma ${sum}%${status}`, closes: gap === 0 };
}

/** The draft's targets; a blank or unreadable field becomes NaN, which validation refuses. */
function readDraft(draft: Draft): Targets {
  return Object.fromEntries(
    ASSET_CLASSES.map((c) => [c.id, draft[c.id].trim() === "" ? NaN : Number(draft[c.id])]),
  ) as Targets;
}
