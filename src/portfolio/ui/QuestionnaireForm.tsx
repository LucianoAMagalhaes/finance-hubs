"use client";

import type { AssetView, QuestionnaireView } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { Sheet } from "@/ui/Sheet";
import { useAction } from "@/ui/useAction";

type Props = {
  asset: AssetView;
  questionnaire: QuestionnaireView;
  save: (question: number, value: boolean) => Promise<string | null>;
  close: () => void;
};

/** Each answer is saved immediately, and the returned projection fills the controls. */
export function QuestionnaireForm({ asset, questionnaire, save, close }: Props) {
  const { run, running, refusal } = useAction();
  const remaining = questionnaire.questions.filter(q => q.answer === null).length;
  return (
    <Sheet labelledBy="questionnaire-title" close={close}>
      <header>
        <h2 id="questionnaire-title">Avaliar {asset.ticker}</h2>
        <p className="hint">{questionnaire.id === "stocks"
          ? "Questionário compartilhado por Ações Nacionais e Ações Internacionais, incluindo ETFs e REITs."
          : "Questionário de FIIs."}</p>
        <p className="hint">Cada resposta é salva ao escolher sim ou não. Você pode corrigir suas respostas.</p>
      </header>
      <div className="content questionnaire-questions">
        <p role="status" aria-live="polite">{asset.score === null ? `Sem nota · ${remaining} ${remaining === 1 ? "pergunta sem resposta" : "perguntas sem resposta"}` : `Nota: ${asset.score}`}</p>
        {questionnaire.questions.map((question, index) => (
          <fieldset key={question.id} disabled={running} className="questionnaire-question">
            <legend>{index + 1}. {question.text}</legend>
            <div className="questionnaire-answers">
              {[true, false].map(value => (
                <label key={String(value)}>
                  <input type="radio" name={`question-${question.id}`} checked={question.answer === value}
                    onChange={() => void run(() => save(question.id, value))} />
                  {value ? "Sim" : "Não"}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <Refusal refusal={refusal} />
      </div>
      <footer>
        <button type="button" className="btn primary" onClick={close} disabled={running}>Concluir</button>
      </footer>
    </Sheet>
  );
}
