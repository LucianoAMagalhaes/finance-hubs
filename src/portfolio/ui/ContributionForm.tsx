"use client";

import { useState, type FormEvent } from "react";
import { suggestContribution, type ContributionSuggestion, type IsoDate, type PortfolioState } from "@/portfolio/domain";
import { Refusal } from "@/ui/Refusal";
import { readDraft } from "./contributionDraft";

export function ContributionForm({ state, today, show }: {
  state: PortfolioState;
  today: IsoDate;
  show: (suggestion: ContributionSuggestion) => void;
}) {
  const [contribution, setContribution] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = readDraft({ contribution });
    if (!amount.ok) { setRefusal(amount.error); return; }
    const result = suggestContribution(state, amount.value, today);
    if (!result.ok) { setRefusal(result.error); return; }
    setRefusal(null);
    show(result.value);
  }

  return (
    <form className="aggregate contribution-form" onSubmit={submit} noValidate>
      <label className="field">
        <span className="k">Aportar agora</span>
        <input type="text" inputMode="decimal" className="num" placeholder="R$ 0,00" value={contribution}
          aria-invalid={refusal !== null} aria-describedby={refusal ? "contribution-refusal" : undefined}
          onChange={event => { setContribution(event.target.value); setRefusal(null); }} />
      </label>
      <button type="submit" className="btn primary">Sugerir</button>
      <div id="contribution-refusal"><Refusal refusal={refusal} /></div>
    </form>
  );
}
