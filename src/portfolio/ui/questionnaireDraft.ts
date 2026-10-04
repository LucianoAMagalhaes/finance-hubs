import type { Questionnaire, QuestionToSave } from "@/portfolio/domain";

export type Draft = (QuestionToSave & { key: number })[];

export const draftFrom = (questionnaire: Questionnaire): Draft => questionnaire.questions.map(q => ({ ...q, key: q.id }));
export const readDraft = (draft: Draft): QuestionToSave[] => draft.map(({ key, ...question }) => question);

/** Local keys keep new text fields stable when questions move, before they have a saved identity. */
export function addQuestion(draft: Draft): Draft {
  return [...draft, { key: Math.max(0, ...draft.map(q => q.key)) + 1, text: "" }];
}

export function moveQuestion(draft: Draft, index: number, direction: -1 | 1): Draft {
  const target = index + direction;
  if (index < 0 || index >= draft.length || target < 0 || target >= draft.length) return draft;
  const moved = [...draft];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
}

export const removeQuestion = (draft: Draft, index: number): Draft =>
  draft.length > 1 ? draft.filter((_, i) => i !== index) : draft;
