import { expect, it } from "vitest";
import { addQuestion, draftFrom, moveQuestion, readDraft, removeQuestion } from "./questionnaireDraft";

it("edits and reorders a draft with stable identities without changing the saved questionnaire", () => {
  const questionnaire = { id: "stocks", questions: [{ id: 1, text: "Primeira?" }, { id: 2, text: "Segunda?" }] } as const;
  const saved = { ...questionnaire, questions: [...questionnaire.questions] };
  const original = draftFrom(saved);
  let draft = addQuestion(original);
  draft = draft.map(q => q.id === 1 ? { ...q, text: "Reescrita?" } : q.id === undefined ? { ...q, text: "Nova?" } : q);
  draft = moveQuestion(draft, 2, -1);
  expect(readDraft(draft)).toEqual([{ id: 1, text: "Reescrita?" }, { text: "Nova?" }, { id: 2, text: "Segunda?" }]);
  expect(new Set(draft.map(q => q.key)).size).toBe(3);
  expect(readDraft(original)).toEqual(saved.questions);
  draft = removeQuestion(draft, 0);
  expect(readDraft(draft)).toEqual([{ text: "Nova?" }, { id: 2, text: "Segunda?" }]);
});

it("keeps the last draft question and ignores moves beyond either end", () => {
  const draft = draftFrom({ id: "real-estate-funds", questions: [{ id: 12, text: "Única?" }] });
  expect(removeQuestion(draft, 0)).toEqual(draft);
  expect(moveQuestion(draft, 0, -1)).toEqual(draft);
  expect(moveQuestion(draft, 0, 1)).toEqual(draft);
});
