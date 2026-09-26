import type { CorporateAction, CorporateActionKind, CorporateActionToSave, IsoDate, Ratio } from "@/portfolio/domain";

/**
 * What is written in the corporate action's sheet, as the person typed it;
 * `id` is the action being corrected. The ratio is typed as the company
 * announces it: `left` para `right` in a split or a reverse split ("1 para
 * 4"), and `left` novas para cada `right` in a bonus ("1 nova para cada 10").
 */
export type CorporateActionDraft = {
  id: number | null;
  /** The action always opens from its asset's row, so the asset is known. */
  asset: number;
  kind: CorporateActionKind;
  date: string;
  left: string;
  right: string;
};

/** A new split of the asset whose row it was opened from, on today. */
export function emptyCorporateActionDraft(today: IsoDate, asset: number): CorporateActionDraft {
  return { id: null, asset, kind: "split", date: today, left: "", right: "" };
}

/** A saved action, as the person would have typed it, to be corrected. */
export function corporateActionDraftFrom(c: CorporateAction): CorporateActionDraft {
  const [left, right] = c.kind === "bonus" ? [c.ratio.to - c.ratio.from, c.ratio.from] : [c.ratio.from, c.ratio.to];
  return { id: c.id, asset: c.asset, kind: c.kind, date: c.date, left: String(left), right: String(right) };
}

/**
 * What the sheet sends: the action as the person wrote it, and what the
 * browser already knows it cannot read. The rest (date, class, a sale left
 * uncovered) is the domain's to refuse.
 */
export function checkCorporateActionDraft(draft: CorporateActionDraft): { action: CorporateActionToSave; error: string | null } {
  const left = parseWhole(draft.left);
  const right = parseWhole(draft.right);
  const ratio: Ratio =
    left === null || right === null ? { from: 0, to: 0 } : draft.kind === "bonus" ? { from: right, to: right + left } : { from: left, to: right };
  const action: CorporateActionToSave = { asset: draft.asset, kind: draft.kind, date: draft.date as IsoDate, ratio };
  return {
    action: draft.id === null ? action : { id: draft.id, ...action },
    error: left === null || right === null ? "Informe a proporção com dois números inteiros, como 1 para 4." : null,
  };
}

/** The ratio as the list shows it: "1:4", "10:1", "1 nova para cada 10". */
export function describeRatio(kind: CorporateActionKind, { from, to }: Ratio): string {
  if (kind !== "bonus") return `${from}:${to}`;
  const added = to - from;
  return `${added} ${added === 1 ? "nova" : "novas"} para cada ${from}`;
}

/** A whole number greater than zero, as typed; null otherwise. */
function parseWhole(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
