"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  formatReais,
  projectPortfolio,
  type ClassView,
  type IsoDate,
  type PortfolioState,
  type PortfolioView,
  type Targets,
} from "@/portfolio/domain";
import { execute } from "@/portfolio/server/actions";
import { ThemeToggle } from "@/ui/ThemeToggle";
import { TargetsForm } from "./TargetsForm";
import { classColor, formatShare, Gain, ToTarget } from "./parts";

type Props = { initialState: PortfolioState; today: IsoDate };

/**
 * The portfolio's dashboard (variation E of the prototype, #71): the band with
 * the whole portfolio, where it is × where it should be, and the classes in a
 * grid. The snapshot is projected here, in the browser, from the state the
 * server returns (ADR-0004).
 */
export function PortfolioScreen({ initialState, today }: Props) {
  const [state, setState] = useState(initialState);
  const [editingTargets, setEditingTargets] = useState(false);
  const view = useMemo(() => projectPortfolio(state, today), [state, today]);

  async function saveTargets(targets: Targets): Promise<string | null> {
    const result = await execute({ type: "save-targets", targets });
    if (!result.ok) return result.error;
    setState(result.value);
    setEditingTargets(false);
    return null;
  }

  return (
    <main className="wrap">
      <header className="topbar">
        <h1 className="portfolio-title">Carteira</h1>
        <div className="actions">
          <ThemeToggle />
          <Link href="/" className="btn">
            ← Orçamento
          </Link>
        </div>
      </header>

      <Band view={view} />

      <div className="section">
        <h2>Onde está × onde deveria estar</h2>
        <span className="rule" />
        <button type="button" className="btn" onClick={() => setEditingTargets(true)}>
          Editar alvos
        </button>
      </div>
      <section className="card allocation" aria-label="Hoje e alvo de cada classe">
        <StackedBar label="Hoje" classes={view.classes} part={(c) => c.share} />
        <StackedBar label="Alvo" classes={view.classes} part={(c) => c.target} />
      </section>

      <div className="section">
        <h2>As classes</h2>
        <span className="rule" />
      </div>
      <div className="grid">
        {view.classes.map((c) => (
          <ClassCard key={c.key} c={c} />
        ))}
      </div>

      {editingTargets && <TargetsForm targets={state.targets} save={saveTargets} close={() => setEditingTargets(false)} />}
    </main>
  );
}

function Band({ view }: { view: PortfolioView }) {
  return (
    <div className="band portfolio-band">
      <div className="aggregate">
        <span className="k">Valor atual</span>
        <span className="v num">{formatReais(view.currentValue)}</span>
        <span className="h">custo {formatReais(view.cost)}</span>
      </div>
      <div className="aggregate">
        <span className="k">Ganho total</span>
        <span className="v num">
          <Gain cents={view.totalGain} />
        </span>
        <span className="h">dos quais {formatReais(view.payouts)} em proventos</span>
      </div>
    </div>
  );
}

/** One bar with every class side by side, each as wide as its part of 100. */
function StackedBar({ label, classes, part }: { label: string; classes: ClassView[]; part: (c: ClassView) => number }) {
  return (
    <div className="stack-row">
      <span className="stack-label">{label}</span>
      <div className="stack">
        {classes
          .filter((c) => part(c) > 0)
          .map((c) => (
            <i key={c.key} style={{ ...classColor(c.key), flexBasis: `${part(c)}%` }} title={`${c.name}: ${formatShare(part(c))}`}>
              {part(c) >= 6 && formatShare(Math.round(part(c)))}
            </i>
          ))}
      </div>
    </div>
  );
}

/** The class as the budget draws a jar: stripe, value, and a bar with the target's mark. */
function ClassCard({ c }: { c: ClassView }) {
  const scale = Math.max(c.share, c.target, 1);
  return (
    <div className="card jar" style={classColor(c.key)}>
      <span className="card-top">
        <span>
          <span className="swatch" />
          {c.name}
        </span>
        <span className="num">
          {formatShare(c.share)} / {c.target}%
        </span>
      </span>
      <span className="card-total num">{formatReais(c.value)}</span>
      <span className="bar">
        <i style={{ width: `${(c.share / scale) * 100}%` }} />
        <b style={{ left: `calc(${(c.target / scale) * 100}% - 1px)` }} />
      </span>
      <span className="card-foot">
        <ToTarget toTarget={c.toTarget} share={c.share} target={c.target} />
        <span>{c.assetCount === 1 ? "1 ativo" : `${c.assetCount} ativos`}</span>
      </span>
    </div>
  );
}
