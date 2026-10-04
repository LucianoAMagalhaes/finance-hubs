"use client";

import { useState, type FormEvent } from "react";
import type { Questionnaire, QuestionToSave } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";
import { addQuestion, draftFrom, moveQuestion, readDraft, removeQuestion } from "./questionnaireDraft";

type Props = {
  questionnaire: Questionnaire;
  save: (questions: QuestionToSave[]) => Promise<string | null>;
  close: () => void;
};

/** Changes stay in the draft until all questions are saved together; a refusal preserves the draft. */
export function QuestionnaireEditor({ questionnaire, save, close }: Props) {
  const [draft, setDraft] = useState(() => draftFrom(questionnaire));
  const { run, running, refusal, clearRefusal } = useAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(() => save(readDraft(draft)));
  }

  return (
    <Sheet labelledBy="questionnaire-editor-title" close={close}>
      <form onSubmit={submit}>
        <header>
          <h2 id="questionnaire-editor-title">Editar questionário de {questionnaire.id === "stocks" ? "ações" : "FIIs"}</h2>
          <p className="hint">{questionnaire.id === "stocks"
            ? "As alterações afetam Ações Nacionais e Ações Internacionais, incluindo ETFs e REITs."
            : "As alterações afetam somente os FIIs."}</p>
          <p className="hint">Perguntas novas deixam os ativos sem nota até serem respondidas. Reescrever ou reordenar preserva respostas; remover apaga as respostas da pergunta. A data da última avaliação não muda.</p>
        </header>
        <div className="content questionnaire-questions">
          {draft.map((question, index) => (
            <fieldset className="questionnaire-question" disabled={running} key={question.key}>
              <label className="field">
                <span>Pergunta {index + 1}</span>
                <textarea rows={3} value={question.text} onChange={event => {
                  clearRefusal();
                  setDraft(draft.map(q => q.key === question.key ? { ...q, text: event.target.value } : q));
                }} />
              </label>
              <div className="questionnaire-tools">
                <button type="button" className="btn" disabled={index === 0} aria-label={`Mover pergunta ${index + 1} para cima`} onClick={() => { clearRefusal(); setDraft(moveQuestion(draft, index, -1)); }}>↑ Subir</button>
                <button type="button" className="btn" disabled={index === draft.length - 1} aria-label={`Mover pergunta ${index + 1} para baixo`} onClick={() => { clearRefusal(); setDraft(moveQuestion(draft, index, 1)); }}>↓ Descer</button>
                <button type="button" className="btn" disabled={draft.length === 1} aria-label={`Remover pergunta ${index + 1}`} onClick={() => { clearRefusal(); setDraft(removeQuestion(draft, index)); }}>Remover</button>
              </div>
            </fieldset>
          ))}
          <p className="hint">Mantenha pelo menos uma pergunta.</p>
          <button type="button" className="btn" disabled={running} onClick={() => { clearRefusal(); setDraft(addQuestion(draft)); }}>+ Pergunta</button>
          <Refusal refusal={refusal} />
        </div>
        <footer>
          <button type="button" className="btn" disabled={running} onClick={close}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={running}>Salvar questionário</button>
        </footer>
      </form>
    </Sheet>
  );
}
