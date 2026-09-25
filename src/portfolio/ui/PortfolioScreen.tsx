"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  formatReais,
  projectPortfolio,
  type Asset,
  type AssetClass,
  type ClassView,
  type IsoDate,
  type PortfolioCommand,
  type PortfolioState,
  type PortfolioView,
  type TradeKind,
} from "@/portfolio/domain";
import { execute } from "@/portfolio/server/actions";
import { ThemeToggle } from "@/ui/ThemeToggle";
import { AssetForm } from "./AssetForm";
import { DeleteAssetForm } from "./DeleteAssetForm";
import { ClassDetail } from "./ClassDetail";
import { PayoutForm } from "./PayoutForm";
import { TargetsForm } from "./TargetsForm";
import { TradeForm } from "./TradeForm";
import { classColor, formatShare, Gain, ToTarget } from "./parts";

type Props = { initialState: PortfolioState; today: IsoDate };

/**
 * The sheet open over the dashboard. A trade or payout carries the one being
 * corrected, or null when new; a new one also carries the asset whose row it
 * came from, or null from the top bar, where the sheet can still turn from a
 * trade into a payout and back.
 */
type OpenSheet =
  | { kind: "targets" }
  | { kind: "asset" }
  | { kind: "delete-asset"; asset: Asset }
  | { kind: "trade"; asset: number | null; trade: number | null; tradeKind: TradeKind }
  | { kind: "payout"; asset: number | null; payout: number | null };

/**
 * The portfolio's dashboard (variation E of the prototype, #71): the band with
 * the whole portfolio, where it is × where it should be, and the classes in a
 * grid, which becomes a column beside the open class's detail. The snapshot
 * is projected here, in the browser, from the state the server returns (ADR-0004).
 */
export function PortfolioScreen({ initialState, today }: Props) {
  const [state, setState] = useState(initialState);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [openClass, setOpenClassRaw] = useState<AssetClass | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const view = useMemo(() => projectPortfolio(state, today), [state, today]);
  const opened = view.classes.find((c) => c.key === openClass);

  const openClassDetail = (key: AssetClass | null) => {
    setOpenClassRaw(key);
    setExpanded(null);
  };

  /** Sends the command; on success takes the new state and closes the sheet. Returns the refusal, or null. */
  async function run(command: PortfolioCommand, after?: (state: PortfolioState) => void): Promise<string | null> {
    const result = await execute(command);
    if (!result.ok) return result.error;
    setState(result.value);
    setSheet(null);
    after?.(result.value);
    return null;
  }

  /** The asset opens expanded, in its class, with what was just launched in its place. */
  function showAsset(id: number) {
    const shown = state.assets.find((a) => a.id === id);
    if (shown && openClass !== shown.assetClass) setOpenClassRaw(shown.assetClass);
    setExpanded(id);
  }

  const cards = view.classes.map((c) => (
    <ClassCard key={c.key} c={c} open={openClass === c.key} toggle={() => openClassDetail(openClass === c.key ? null : c.key)} />
  ));

  return (
    <main className="wrap">
      <header className="topbar">
        <h1 className="portfolio-title">Carteira</h1>
        <div className="actions">
          <ThemeToggle />
          <Link href="/" className="btn">
            ← Orçamento
          </Link>
          <button type="button" className="btn" onClick={() => setSheet({ kind: "asset" })}>
            + Ativo
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={state.assets.length === 0}
            title={state.assets.length === 0 ? "Cadastre um ativo antes de lançar" : undefined}
            onClick={() => setSheet({ kind: "trade", asset: null, trade: null, tradeKind: "buy" })}
          >
            + Lançar
          </button>
        </div>
      </header>

      <Band view={view} />

      <div className="section">
        <h2>Onde está × onde deveria estar</h2>
        <span className="rule" />
        <button type="button" className="btn" onClick={() => setSheet({ kind: "targets" })}>
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
      {opened ? (
        <div className="master-detail">
          <div className="column">{cards}</div>
          <div className="sheet-backdrop" onClick={() => openClassDetail(null)} aria-hidden />
          <ClassDetail
            c={opened}
            expanded={expanded}
            expand={setExpanded}
            close={() => openClassDetail(null)}
            newTrade={(asset) => setSheet({ kind: "trade", asset, trade: null, tradeKind: "buy" })}
            editTrade={(trade) => setSheet({ kind: "trade", asset: null, trade, tradeKind: "buy" })}
            newPayout={(asset) => setSheet({ kind: "payout", asset, payout: null })}
            editPayout={(payout) => setSheet({ kind: "payout", asset: null, payout })}
            deleteAsset={(id) => {
              const asset = state.assets.find((a) => a.id === id);
              if (asset) setSheet({ kind: "delete-asset", asset });
            }}
          />
        </div>
      ) : (
        <div className="grid">{cards}</div>
      )}

      {sheet?.kind === "targets" && (
        <TargetsForm targets={state.targets} save={(targets) => run({ type: "save-targets", targets })} close={() => setSheet(null)} />
      )}
      {sheet?.kind === "asset" && (
        <AssetForm
          proposedClass={openClass}
          // The new asset's class opens, so the person sees it land.
          save={(asset) => run({ type: "save-asset", asset }, () => openClassDetail(asset.assetClass))}
          close={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "delete-asset" && (
        <DeleteAssetForm
          asset={sheet.asset}
          delete={() => run({ type: "delete-asset", id: sheet.asset.id }, () => setExpanded(null))}
          close={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "trade" && (
        <TradeForm
          assets={state.assets}
          asset={state.assets.find((a) => a.id === sheet.asset) ?? null}
          trade={state.trades.find((t) => t.id === sheet.trade) ?? null}
          kind={sheet.tradeKind}
          today={today}
          payoutInstead={fromTopBar(sheet) ? () => setSheet({ kind: "payout", asset: null, payout: null }) : undefined}
          save={(trade) => run({ type: "save-trade", trade }, () => showAsset(trade.asset))}
          delete={() => run({ type: "delete-trade", id: sheet.trade! })}
          close={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "payout" && (
        <PayoutForm
          assets={state.assets}
          asset={state.assets.find((a) => a.id === sheet.asset) ?? null}
          payout={state.payouts.find((p) => p.id === sheet.payout) ?? null}
          today={today}
          tradeInstead={
            fromTopBar(sheet) ? (tradeKind) => setSheet({ kind: "trade", asset: null, trade: null, tradeKind }) : undefined
          }
          save={(payout) => run({ type: "save-payout", payout }, () => showAsset(payout.asset))}
          delete={() => run({ type: "delete-payout", id: sheet.payout! })}
          close={() => setSheet(null)}
        />
      )}
    </main>
  );
}

/** A new launch from the top bar's + Lançar, which can still turn from a trade into a payout and back. */
const fromTopBar = (sheet: { asset: number | null; trade?: number | null; payout?: number | null }) =>
  sheet.asset === null && (sheet.trade ?? sheet.payout ?? null) === null;

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
        <span className="h">dos quais {formatReais(view.payoutsReceived)} em proventos</span>
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

/** The class as the budget draws a jar: stripe, value, and a bar with the target's mark. Opens its detail. */
function ClassCard({ c, open, toggle }: { c: ClassView; open: boolean; toggle: () => void }) {
  const scale = Math.max(c.share, c.target, 1);
  return (
    <button type="button" className={`card jar ${open ? "open" : ""}`} style={classColor(c.key)} aria-pressed={open} onClick={toggle}>
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
    </button>
  );
}
