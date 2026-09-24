"use client";

// PROTOTYPE (#71), throwaway: three structurally different portfolio dashboards.
// A: one Google Finance-style table grouped by class.
// B: class cards (actual × target) with the selected class's assets in a detail pane.
// C: target × actual first, the contribution as the primary affordance, a flat asset list.

import { Fragment, useState, type CSSProperties } from "react";
import {
  ASSETS,
  CLASS_VIEWS,
  PORTFOLIO,
  QUOTES_AT,
  USD_RATE,
  dollars,
  gainClass,
  pct,
  price,
  qty,
  reais,
  signed,
  signedUsd,
  TRADES,
  PAYOUTS,
  isPrivateBond,
  date,
  type Asset,
  type ClassId,
  type ClassView,
} from "./data";

const clsColor = (id: ClassId) => ({ "--cls": `var(--cls-${id})` }) as CSSProperties;
const clsName = (id: ClassId) => CLASS_VIEWS.find((c) => c.id === id)!.name;

/** What a button would open; the prototype only says so. */
function useStub() {
  const [stub, setStub] = useState<string | null>(null);
  const notice = stub && (
    <div className="saved-notice" role="status">
      <span>Protótipo: aqui abriria {stub}.</span>
      <button type="button" className="close" onClick={() => setStub(null)} aria-label="Dispensar">
        ×
      </button>
    </div>
  );
  return { open: setStub, notice };
}

function Freshness() {
  return (
    <div className="status">
      <span className="chip">cotações de {QUOTES_AT}</span>
      <span className="chip">US$ 1 = {reais(USD_RATE)}</span>
    </div>
  );
}

function Gap({ gap }: { gap: number }) {
  if (Math.abs(gap) < 1) return <span className="pt-gap">no alvo</span>;
  return gap > 0 ? (
    <span className="pt-gap short">faltam {reais(gap)}</span>
  ) : (
    <span className="pt-gap over">{reais(-gap)} acima</span>
  );
}

function Score({ a }: { a: Asset }) {
  if (a.score == null) return <span className="pt-score none">sem nota</span>;
  return <span className={`pt-score ${a.score <= 0 ? "bad" : ""}`}>{a.score}</span>;
}

function Flags({ a }: { a: Asset }) {
  const shown = a.flags.filter((f) => f !== "sem nota" && f !== "nota ≤ 0");
  return (
    <>
      {shown.map((f) => (
        <span key={f} className="pt-flag">
          {f}
        </span>
      ))}
    </>
  );
}

function Name({ a }: { a: Asset }) {
  return (
    <span className="pt-name">
      <strong>{a.ticker}</strong>
      {a.detail && <small>{a.detail}</small>}
      <Flags a={a} />
    </span>
  );
}

/* ================================================================== A */

export function VariantA() {
  const stub = useStub();
  return (
    <main className="wrap">
      <header className="topbar">
        <h1 className="pt-title">Carteira</h1>
        <Freshness />
        <div className="actions">
          <button type="button" className="btn" onClick={() => stub.open("o cadastro de ativo")}>
            + Ativo
          </button>
          <button type="button" className="btn" onClick={() => stub.open("o lançamento de provento")}>
            + Provento
          </button>
          <button type="button" className="btn" onClick={() => stub.open("o lançamento de operação")}>
            + Operação
          </button>
          <button type="button" className="btn primary" onClick={() => stub.open("a sugestão de aporte")}>
            Sugerir aporte
          </button>
        </div>
      </header>
      {stub.notice}

      <div className="band">
        <div className="aggregate">
          <div className="k">Valor atual</div>
          <div className="v num">{reais(PORTFOLIO.value)}</div>
        </div>
        <div className="aggregate">
          <div className="k">Custo</div>
          <div className="v num">{reais(PORTFOLIO.cost)}</div>
        </div>
        <div className="aggregate">
          <div className="k">Ganho total</div>
          <div className="v num val income">{signed(PORTFOLIO.totalGain)}</div>
          <div className="h">valorização + vendas + proventos</div>
        </div>
        <div className="aggregate">
          <div className="k">Proventos recebidos</div>
          <div className="v num">{reais(PORTFOLIO.payouts)}</div>
        </div>
      </div>

      <AssetTable classes={CLASS_VIEWS} />
    </main>
  );
}

/** A's table: one header, a tbody per class. D reuses it for the opened class only. */
function AssetTable({
  classes,
  classRow = true,
  onRow,
  expanded,
  stub,
}: {
  stub?: (what: string) => void;
  classes: ClassView[];
  classRow?: boolean;
  onRow?: (a: Asset) => void;
  expanded?: string | null;
}) {
  return (
      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th>Ativo</th>
              <th className="right">Quantidade</th>
              <th className="right">Preço médio</th>
              <th className="right">Cotação</th>
              <th className="right">Valor atual</th>
              <th className="right">Ganho total</th>
              <th className="right">Nota</th>
            </tr>
          </thead>
          {classes.map((c) => (
            <tbody key={c.id} style={clsColor(c.id)}>
              {classRow && (
              <tr className="pt-class-row">
                <th colSpan={4}>
                  <span className="pt-dot" /> {c.name}
                  <span className="pt-share num">
                    {pct(c.share)} <small>de {c.target}% alvo</small>
                  </span>
                  <Gap gap={c.gap} />
                </th>
                <th className="right num">{reais(c.value)}</th>
                <th className={`right num ${gainClass(c.totalGain)}`}>{signed(c.totalGain)}</th>
                <th />
              </tr>
              )}
              {c.assets.map((a) => (
                <Fragment key={a.ticker}>
                <tr
                  className={`${a.qty === 0 ? "pt-zero" : ""} ${onRow ? "pt-clickable" : ""} ${expanded === a.ticker ? "pt-expanded" : ""}`}
                  onClick={onRow && (() => onRow(a))}
                >
                  <td>
                    {expanded !== undefined && <span className="pt-caret">{expanded === a.ticker ? "▾" : "▸"}</span>}
                    <Name a={a} />
                  </td>
                  <td className="right num">{a.qty === 0 ? "—" : qty(a.qty)}</td>
                  <td className="right num">
                    {a.qty === 0 ? "—" : price(a, a.avg)}
                    {a.usd && a.qty > 0 && <small className="pt-sub">{reais(a.avgBrl!)}</small>}
                  </td>
                  <td className="right num">{price(a, a.price)}</td>
                  <td className="right num">
                    {a.usd && <small className="pt-sub">{dollars(a.valueUsd!)}</small>}
                    {a.qty === 0 ? "—" : reais(a.value)}
                  </td>
                  <td className={`right num ${gainClass(a.totalGain)}`}>
                    {a.usd && a.qty > 0 && <small className="pt-sub">{signedUsd(a.totalGainUsd!)}</small>}
                    {a.totalGain === 0 ? "—" : signed(a.totalGain)}
                    {a.gainPct != null && <small className="pt-sub">{pct(a.gainPct * 100)}</small>}
                  </td>
                  <td className="right">
                    <Score a={a} />
                  </td>
                </tr>
                {expanded === a.ticker && (
                  <tr className="pt-inline">
                    <td colSpan={7}>
                      <History a={a} compact stub={stub} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          ))}
        </table>
      </div>
  );
}

/* ================================================================== B */

function ClassCard({ c, open, toggle }: { c: ClassView; open: boolean; toggle: () => void }) {
  const max = Math.max(c.share, c.target, 1) * 1.15;
  return (
    <button type="button" className={`card pt-class-card ${open ? "open" : ""}`} style={clsColor(c.id)} onClick={toggle}>
      <div className="card-top">
        <span className="pt-dot" />
        <strong>{c.name}</strong>
        <span className="pt-count">{c.assets.length} ativos</span>
      </div>
      <div className="card-total num">{reais(c.value)}</div>
      <div className="pt-meter" title={`${pct(c.share)} de ${c.target}%`}>
        <i style={{ width: `${(c.share / max) * 100}%` }} />
        <b style={{ left: `${(c.target / max) * 100}%` }} />
      </div>
      <div className="pt-card-foot">
        <span className="num">
          {pct(c.share)} <small>de {c.target}%</small>
        </span>
        <Gap gap={c.gap} />
      </div>
      <div className={`pt-card-gain num ${gainClass(c.totalGain)}`}>ganho {signed(c.totalGain)}</div>
    </button>
  );
}

function AssetList({ c }: { c: ClassView }) {
  return (
    <div className="pt-detail" style={clsColor(c.id)}>
      <header>
        <span className="pt-dot" />
        <h2>{c.name}</h2>
        <span className="pt-count">alvo {c.target}% · o peso de cada ativo sai da nota</span>
      </header>
      {c.assets.map((a) => (
        <div key={a.ticker} className={`pt-asset ${a.qty === 0 ? "pt-zero" : ""}`}>
          <div className="pt-asset-main">
            <Name a={a} />
            <span className="pt-asset-pos num">
              {a.qty === 0
                ? "sem posição"
                : `${qty(a.qty)} × ${price(a, a.avg)} médio · cotação ${price(a, a.price)}`}
            </span>
          </div>
          <div className="pt-asset-nums">
            <span className="num">
              {a.qty === 0 ? "—" : reais(a.value)}
              {a.usd && a.qty > 0 && <small className="pt-sub">{dollars(a.valueUsd!)}</small>}
            </span>
            <span className={`num ${gainClass(a.totalGain)}`}>
              {a.totalGain === 0 ? "—" : signed(a.totalGain)}
              {a.gainPct != null && <small className="pt-sub">{pct(a.gainPct * 100)}</small>}
            </span>
            <Score a={a} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VariantB() {
  const stub = useStub();
  const [open, setOpen] = useState<ClassId | null>("domestic-stocks");
  const [amount, setAmount] = useState("");
  const opened = CLASS_VIEWS.find((c) => c.id === open);
  return (
    <main className="wrap">
      <header className="topbar">
        <h1 className="pt-title">Carteira</h1>
        <Freshness />
        <div className="actions">
          <button type="button" className="btn" onClick={() => stub.open("o cadastro de ativo")}>
            + Ativo
          </button>
          <button type="button" className="btn primary" onClick={() => stub.open("o lançamento de operação ou provento")}>
            + Lançar
          </button>
        </div>
      </header>
      {stub.notice}

      <div className="band pt-band-b">
        <div className="aggregate">
          <div className="k">Valor atual</div>
          <div className="v num">{reais(PORTFOLIO.value)}</div>
          <div className="h">custo {reais(PORTFOLIO.cost)}</div>
        </div>
        <div className="aggregate">
          <div className="k">Ganho total</div>
          <div className="v num val income">{signed(PORTFOLIO.totalGain)}</div>
          <div className="h">dos quais {reais(PORTFOLIO.payouts)} em proventos</div>
        </div>
        <form
          className="aggregate pt-aporte-inline"
          onSubmit={(e) => {
            e.preventDefault();
            stub.open(`a sugestão para um aporte de R$ ${amount || "0"}`);
          }}
        >
          <label className="k" htmlFor="aporte-b">
            Aportar agora
          </label>
          <div className="pt-aporte-row">
            <input id="aporte-b" inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button type="submit" className="btn">
              Sugerir
            </button>
          </div>
        </form>
      </div>

      <div className="section">
        <h2>As classes</h2>
        <span className="rule" />
        <button type="button" className="btn" onClick={() => stub.open("o editor dos alvos")}>
          Editar alvos
        </button>
      </div>
      <div className="pt-b-layout">
        <div className="pt-class-grid">
          {CLASS_VIEWS.map((c) => (
            <ClassCard key={c.id} c={c} open={open === c.id} toggle={() => setOpen(open === c.id ? null : c.id)} />
          ))}
        </div>
        {opened && <AssetList c={opened} />}
      </div>
    </main>
  );
}

/* ================================================================== C */

function StackedBar({ label, part }: { label: string; part: (c: ClassView) => number }) {
  return (
    <div className="pt-stack-row">
      <span className="pt-stack-label">{label}</span>
      <div className="pt-stack">
        {CLASS_VIEWS.map((c) => (
          <i key={c.id} style={{ ...clsColor(c.id), flexBasis: `${part(c)}%` }} title={`${c.name}: ${pct(part(c))}`}>
            {part(c) >= 6 && pct(part(c), 0)}
          </i>
        ))}
      </div>
    </div>
  );
}

export function VariantC() {
  const stub = useStub();
  const [amount, setAmount] = useState("");
  const attention = ASSETS.filter((a) => a.flags.length > 0);
  const byWeight = [...ASSETS].sort((x, y) => y.value - x.value);
  return (
    <main className="wrap">
      <header className="topbar">
        <div>
          <h1 className="pt-title">{reais(PORTFOLIO.value)}</h1>
          <div className={`pt-hero-gain num ${gainClass(PORTFOLIO.totalGain)}`}>
            {signed(PORTFOLIO.totalGain)} de ganho total sobre {reais(PORTFOLIO.cost)} de custo
          </div>
        </div>
        <Freshness />
        <div className="actions">
          <button type="button" className="btn" onClick={() => stub.open("o lançamento de provento")}>
            + Provento
          </button>
          <button type="button" className="btn" onClick={() => stub.open("o lançamento de operação")}>
            + Operação
          </button>
        </div>
      </header>
      {stub.notice}

      <div className="pt-c-top">
        <section className="card pt-alloc">
          <div className="pt-alloc-head">
            <h2>Onde está × onde deveria estar</h2>
            <button type="button" className="btn" onClick={() => stub.open("o editor dos alvos")}>
              Editar alvos
            </button>
          </div>
          <StackedBar label="Hoje" part={(c) => c.share} />
          <StackedBar label="Alvo" part={(c) => c.target} />
          <div className="pt-legend">
            {CLASS_VIEWS.map((c) => (
              <div key={c.id} className="pt-legend-row" style={clsColor(c.id)}>
                <span className="pt-dot" />
                <span>{c.name}</span>
                <span className="num right">{reais(c.value)}</span>
                <span className="num right">
                  {pct(c.share)} <small>/ {c.target}%</small>
                </span>
                <Gap gap={c.gap} />
              </div>
            ))}
          </div>
        </section>

        <form
          className="card pt-aporte-hero"
          onSubmit={(e) => {
            e.preventDefault();
            stub.open(`a sugestão para um aporte de R$ ${amount || "0"}`);
          }}
        >
          <label htmlFor="aporte-c">Quanto vai aportar agora?</label>
          <input id="aporte-c" inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="submit" className="btn primary">
            Sugerir onde pôr
          </button>
          <p className="hint">Leva primeiro cada classe ao alvo e, dentro dela, divide pela nota. Nunca manda vender.</p>
          {attention.length > 0 && (
            <div className="pt-attention">
              <h3>Não recebem aporte agora</h3>
              {attention.map((a) => (
                <div key={a.ticker}>
                  <strong>{a.ticker}</strong> <span>{a.flags.join(", ")}</span>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>

      <div className="section">
        <h2>Os ativos</h2>
        <span className="rule" />
        <span className="extra">do maior para o menor</span>
      </div>
      <div className="pt-flat">
        {byWeight.map((a) => (
          <div key={a.ticker} className={`pt-flat-row ${a.qty === 0 ? "pt-zero" : ""}`} style={clsColor(a.cls)}>
            <span className="pt-dot" title={clsName(a.cls)} />
            <Name a={a} />
            <span className="pt-flat-bar">
              <i style={{ width: `${(a.value / byWeight[0]!.value) * 100}%` }} />
            </span>
            <span className="num right">{a.qty === 0 ? "sem posição" : reais(a.value)}</span>
            <span className="num right pt-muted">{a.qty === 0 ? "" : pct((a.value / PORTFOLIO.value) * 100)}</span>
            <span className={`num right ${gainClass(a.totalGain)}`}>
              {a.gainPct != null ? pct(a.gainPct * 100) : a.totalGain !== 0 ? signed(a.totalGain) : "—"}
            </span>
            <Score a={a} />
          </div>
        ))}
      </div>
    </main>
  );
}

/* ================================================================== D */

// D = B's structure (band with the contribution, class cards opening a detail) + A's table as
// the detail + C's "Onde está × onde deveria estar" bars. The classes are laid out exactly
// like the budget's jars: a grid of cards, and with one open, the budget's master-detail
// (320px column + detail panel), with A's table inside the panel.
// Seeing an asset's trades: D drills into the asset inside the same panel; E expands the row.

export const VariantD = () => <ClassesDashboard mode="drill" />;
export const VariantE = () => <ClassesDashboard mode="inline" />;

function ClassesDashboard({ mode }: { mode: "drill" | "inline" }) {
  const stub = useStub();
  const [open, setOpenRaw] = useState<ClassId | null>("domestic-stocks");
  const [asset, setAsset] = useState<string | null>(null);
  const setOpen = (id: ClassId | null) => {
    setOpenRaw(id);
    setAsset(null);
  };
  const shownAsset = ASSETS.find((a) => a.ticker === asset);
  const [amount, setAmount] = useState("");
  const opened = CLASS_VIEWS.find((c) => c.id === open);
  const cardsD = CLASS_VIEWS.map((c) => (
    <JarLikeCard key={c.id} c={c} open={open === c.id} toggle={() => setOpen(open === c.id ? null : c.id)} />
  ));
  return (
    <main className="wrap">
      <header className="topbar">
        <h1 className="pt-title">Carteira</h1>
        <Freshness />
        <div className="actions">
          <button type="button" className="btn" onClick={() => stub.open("o cadastro de ativo")}>
            + Ativo
          </button>
          <button type="button" className="btn primary" onClick={() => stub.open("o lançamento de operação ou provento")}>
            + Lançar
          </button>
        </div>
      </header>
      {stub.notice}

      <div className="band pt-band-b">
        <div className="aggregate">
          <div className="k">Valor atual</div>
          <div className="v num">{reais(PORTFOLIO.value)}</div>
          <div className="h">custo {reais(PORTFOLIO.cost)}</div>
        </div>
        <div className="aggregate">
          <div className="k">Ganho total</div>
          <div className="v num val income">{signed(PORTFOLIO.totalGain)}</div>
          <div className="h">dos quais {reais(PORTFOLIO.payouts)} em proventos</div>
        </div>
        <form
          className="aggregate pt-aporte-inline"
          onSubmit={(e) => {
            e.preventDefault();
            stub.open(`a sugestão para um aporte de R$ ${amount || "0"}`);
          }}
        >
          <label className="k" htmlFor="aporte-d">
            Aportar agora
          </label>
          <div className="pt-aporte-row">
            <input id="aporte-d" inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button type="submit" className="btn">
              Sugerir
            </button>
          </div>
        </form>
      </div>

      <div className="section">
        <h2>Onde está × onde deveria estar</h2>
        <span className="rule" />
        <button type="button" className="btn" onClick={() => stub.open("o editor dos alvos")}>
          Editar alvos
        </button>
      </div>
      <section className="card pt-alloc">
        <StackedBar label="Hoje" part={(c) => c.share} />
        <StackedBar label="Alvo" part={(c) => c.target} />
      </section>

      <div className="section">
        <h2>As classes</h2>
        <span className="rule" />
      </div>
      {opened ? (
        <div className="master-detail">
          <div className="column">{cardsD}</div>
          <section className="detail pt-detail-d" aria-label={opened.name} style={jarStyle(opened.id)}>
            {mode === "drill" && shownAsset ? (
              <AssetDetail a={shownAsset} className={opened.name} back={() => setAsset(null)} close={() => setOpen(null)} stub={stub.open} />
            ) : (
              <>
                <header>
                  <button type="button" className="close" onClick={() => setOpen(null)} aria-label="Fechar o detalhe e voltar à grade">
                    ×
                  </button>
                  <div className="kicker">Classe</div>
                  <h2>
                    <span className="swatch" />
                    {opened.name}
                  </h2>
                  <div className="detail-summary">
                    <span className="detail-total num">{reais(opened.value)}</span>
                    <Gap gap={opened.gap} />
                    <span className={`hint num ${gainClass(opened.totalGain)}`}>ganho {signed(opened.totalGain)}</span>
                  </div>
                  <p className="hint">
                    {pct(opened.share)} da carteira · alvo {opened.target}% · o peso de cada ativo sai da nota
                  </p>
                </header>
                <AssetTable
                  classes={[opened]}
                  classRow={false}
                  onRow={(a) => setAsset(mode === "inline" && asset === a.ticker ? null : a.ticker)}
                  expanded={mode === "inline" ? asset : undefined}
                  stub={stub.open}
                />
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="grid">{cardsD}</div>
      )}
    </main>
  );
}

const jarStyle = (id: ClassId) => ({ "--jar": `var(--cls-${id})`, "--cls": `var(--cls-${id})` }) as CSSProperties;

/** The class as the budget's JarCard draws a jar: stripe, total, bar with the target mark. */
function JarLikeCard({ c, open, toggle }: { c: ClassView; open: boolean; toggle: () => void }) {
  const scale = Math.max(c.share, c.target, 1);
  return (
    <button type="button" className={`card jar ${open ? "open" : ""}`} style={jarStyle(c.id)} aria-pressed={open} onClick={toggle}>
      <span className="card-top">
        <span>
          <span className="swatch" />
          {c.name}
        </span>
        <span className="num">
          {pct(c.share)} / {c.target}%
        </span>
      </span>
      <span className="card-total num">{reais(c.value)}</span>
      <span className="bar">
        <i style={{ width: `${(c.share / scale) * 100}%` }} />
        <b style={{ left: `calc(${(c.target / scale) * 100}% - 1px)` }} />
      </span>
      <span className="card-foot">
        <Gap gap={c.gap} />
        <span>{c.assets.length} ativos</span>
      </span>
    </button>
  );
}

/** D: the asset's own page inside the detail panel, with the way back to the class. */
function AssetDetail({
  a,
  className,
  back,
  close,
  stub,
}: {
  a: Asset;
  className: string;
  back: () => void;
  close: () => void;
  stub: (what: string) => void;
}) {
  return (
    <>
      <header>
        <button type="button" className="close" onClick={close} aria-label="Fechar o detalhe e voltar à grade">
          ×
        </button>
        <button type="button" className="pt-back" onClick={back}>
          ‹ {className}
        </button>
        <h2>
          <span className="swatch" />
          {a.ticker} {a.detail && <small className="pt-muted">{a.detail}</small>}
        </h2>
        <div className="detail-summary">
          <span className="detail-total num">{a.qty === 0 ? "sem posição" : reais(a.value)}</span>
          <Flags a={a} />
          <span className="hint">
            nota <Score a={a} />
          </span>
          <button type="button" className="btn rename" onClick={() => stub(`a avaliação de ${a.ticker}`)}>
            Avaliar
          </button>
        </div>
      </header>
      <dl className="pt-facts">
        <div>
          <dt>Quantidade</dt>
          <dd className="num">{qty(a.qty)}</dd>
        </div>
        <div>
          <dt>Preço médio</dt>
          <dd className="num">
            {a.qty === 0 ? "—" : price(a, a.avg)}
            {a.usd && a.qty > 0 && <small className="pt-sub">{reais(a.avgBrl!)}</small>}
          </dd>
        </div>
        <div>
          <dt>Custo</dt>
          <dd className="num">{reais(a.cost)}</dd>
        </div>
        <div>
          <dt>Cotação</dt>
          <dd className="num">{price(a, a.price)}</dd>
        </div>
      </dl>
      <dl className="pt-facts">
        <div>
          <dt>Valorização</dt>
          <dd className={`num ${gainClass(a.unrealized)}`}>{signed(a.unrealized)}</dd>
        </div>
        <div>
          <dt>Resultado das vendas</dt>
          <dd className={`num ${gainClass(a.realized ?? 0)}`}>{signed(a.realized ?? 0)}</dd>
        </div>
        <div>
          <dt>Proventos</dt>
          <dd className="num up">{signed(a.payouts ?? 0)}</dd>
        </div>
        <div>
          <dt>Ganho total</dt>
          <dd className={`num ${gainClass(a.totalGain)}`}>
            <strong>{signed(a.totalGain)}</strong>
          </dd>
        </div>
      </dl>
      <History a={a} stub={stub} />
    </>
  );
}

/** The asset's trades and payouts, newest first. `compact` is E's version, inside the table row. */
function History({ a, compact = false, stub }: { a: Asset; compact?: boolean; stub?: (what: string) => void }) {
  const bond = isPrivateBond(a);
  const trades = [...(TRADES[a.ticker] ?? [])].reverse();
  const payouts = [...(PAYOUTS[a.ticker] ?? [])].reverse();
  const kindName = (k: "buy" | "sell") => (bond ? (k === "buy" ? "Aplicação" : "Resgate") : k === "buy" ? "Compra" : "Venda");
  return (
    <div className={`pt-history ${compact ? "compact" : ""}`}>
      <div className="pt-history-head">
        <h3>Operações</h3>
        <span className="pt-history-actions">
          {compact && (
            <button type="button" className="btn" onClick={() => stub?.(`a avaliação de ${a.ticker}`)}>
              Avaliar
            </button>
          )}
          <button type="button" className="btn" onClick={() => stub?.(`uma nova operação de ${a.ticker}`)}>
            + Operação
          </button>
        </span>
      </div>
      {trades.length === 0 ? (
        <p className="pt-muted pt-empty">Nenhuma operação. O ativo existe e pode receber aporte.</p>
      ) : (
        <table className="pt-ops">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              {!bond && <th className="right">Quantidade</th>}
              {!bond && <th className="right">Preço</th>}
              {a.usd && <th className="right">Câmbio</th>}
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => {
              const totalAsset = t.qty * t.price;
              return (
                <tr key={i} className="pt-clickable" onClick={() => stub?.(`a correção da operação de ${date(t.date)}`)}>
                  <td className="num">{date(t.date)}</td>
                  <td>
                    <span className={`pt-kind ${t.kind}`}>{kindName(t.kind)}</span>
                  </td>
                  {!bond && <td className="right num">{qty(t.qty)}</td>}
                  {!bond && <td className="right num">{price(a, t.price)}</td>}
                  {a.usd && <td className="right num">{t.fx?.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>}
                  <td className="right num">
                    {a.usd ? (
                      <>
                        {dollars(totalAsset)}
                        <small className="pt-sub">{reais(totalAsset * (t.fx ?? 1))}</small>
                      </>
                    ) : (
                      reais(totalAsset)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="pt-history-head">
        <h3>Proventos</h3>
        <button type="button" className="btn" onClick={() => stub?.(`um novo provento de ${a.ticker}`)}>
          + Provento
        </button>
      </div>
      {payouts.length === 0 ? (
        <p className="pt-muted pt-empty">Nenhum provento.</p>
      ) : (
        <table className="pt-ops">
          <thead>
            <tr>
              <th>Pagamento</th>
              <th>Tipo</th>
              <th className="right">Valor líquido</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p, i) => (
              <tr key={i} className="pt-clickable" onClick={() => stub?.(`a correção do provento de ${date(p.date)}`)}>
                <td className="num">{date(p.date)}</td>
                <td>{p.kind}</td>
                <td className="right num up">{reais(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
