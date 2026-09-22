import type { State } from "./state";
import type { Expense } from "./expenses";
import { live } from "./trash";

/**
 * The tag as it is stored: lowercase, without "#", spaces become hyphens, accents
 * preserved ("saude" ≠ "saúde"). Null when no name is left: the expense
 * goes untagged.
 */
export function normalizeTag(text: string): string | null {
  // NFC: the combining accent (pasted from elsewhere) and the precomposed one become the same tag.
  const tag = text.normalize("NFC").trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-");
  return tag || null;
}

/**
 * The tags some expense outside the trash uses, in any period of a
 * recurring expense, without repeats, in alphabetical order: a tag exists while it is used.
 */
export function tagsInUse(state: State): string[] {
  return tagsOf(live(state.expenses));
}

/**
 * The tags of every expense, in the trash or not. It is the reach of a
 * rename, and therefore the universe of the merge: a name sleeping in the trash
 * reappears on restore, and merging with it also needs confirmation.
 */
export function tagsInHistory(state: State): string[] {
  return tagsOf(state.expenses);
}

const tagsOf = (expenses: Expense[]) =>
  distinctTags(expenses.flatMap<{ tag: string | null }>((e) => (e.kind === "purchase" ? [e] : e.periods)));

/**
 * Which tag in use the new name merges with, or null when renaming is just
 * changing the name. The screen asks before requesting the confirmation and the command asks
 * before demanding it: the merge that is confirmed is the same one that is made.
 */
export function mergeOnRename(inUse: string[], from: string, to: string): string | null {
  const renamed = normalizeTag(to);
  if (renamed === null || renamed === normalizeTag(from)) return null;
  return inUse.includes(renamed) ? renamed : null;
}

/**
 * How many expenses outside the trash use the tag: the size of a rename,
 * which the screen shows before merging two. A recurring expense counts only once, even
 * if several of its periods use it.
 */
export function expensesWithTag(state: State, tag: string): number {
  return live(state.expenses).filter((e) => (e.kind === "purchase" ? e.tag === tag : e.periods.some((p) => p.tag === tag))).length;
}

/** The tags of a list of expenses or occurrences, without repeats, in alphabetical order. */
export function distinctTags(records: { tag: string | null }[]): string[] {
  const tags = new Set(records.flatMap((r) => (r.tag ? [r.tag] : [])));
  return [...tags].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// No red (overrun), green (income) or violet (refund): color as state stays free.
const HUES = [28, 45, 170, 190, 208, 225, 318, 338] as const;

/**
 * The hue (HSL) of the tag's color. A tag isn't registered, so the color comes from the name:
 * the same tag has the same color in any month. Different tags may repeat colors.
 */
export function tagHue(tag: string): number {
  let hash = 0;
  for (const c of tag) hash = (hash * 31 + c.codePointAt(0)!) >>> 0;
  return HUES[hash % HUES.length]!;
}
