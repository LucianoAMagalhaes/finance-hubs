"use client";

import {
  formatReais,
  groups,
  monthName,
  jarName,
  paymentMethodName,
  allExpenses,
  axisName,
  isJarGroup,
  type Axis,
  type Group,
  type Occurrence,
  type JarGroup,
  type MonthView,
} from "@/domain";
import type { Opened } from "./monthFlow";
import { tagColor, jarColor, installmentRange, TagPill, plural, Amount } from "./parts";

type Props = {
  view: MonthView;
  axis: Axis;
  opened: Opened | null;
  open: (opened: Opened | null) => void;
  openOccurrence: (occurrence: Occurrence) => void;
  /** Opens the form that changes this tag's name across the whole history. */
  renameTag: (tag: string) => void;
};

/**
 * The axis's groups as a grid. With a group open, the grid becomes a column
 * with the same cards, just stacked, and the detail sits beside it: switching
 * group costs one click. A group that does not exist in the month goes back to
 * the grid.
 *
 * In a narrow window the CSS puts the detail as a bottom sheet over the grid,
 * and there the backdrop — inert in the wide layout — is what closes it on a
 * tap outside.
 */
export function MasterDetail({ view, axis, opened, open, openOccurrence, renameTag }: Props) {
  const axisGroups = groups(view, axis);
  const detail = opened?.kind === "all" ? allExpenses(view) : opened && axisGroups.find((g) => g.key === opened.key);
  const cards = axisGroups.map((g) => {
    const selected = opened?.kind === "group" && opened.key === g.key;
    const click = () => open(selected ? null : { kind: "group", key: g.key });
    // A tag is never empty once normalized: "" collides with none.
    const key = g.key ?? "";
    return isJarGroup(g) ? (
      <JarCard key={key} jar={g} selected={selected} click={click} />
    ) : (
      <GroupCard key={key} group={g} axis={axis} selected={selected} click={click} />
    );
  });

  if (!detail) {
    if (axisGroups.length === 0) return <p className="empty-grid">Nenhum gasto neste mês.</p>;
    return <div className="grid">{cards}</div>;
  }
  return (
    <div className="master-detail">
      <div className="column">
        {cards}
        <div className="expenses-sum">
          <span>Soma = despesas</span>
          <strong className="num">
            <Amount cents={view.aggregates.monthExpenses} />
          </strong>
        </div>
      </div>
      <div className="sheet-backdrop" onClick={() => open(null)} aria-hidden />
      <Detail
        view={view}
        group={detail}
        axis={opened?.kind === "all" ? null : axis}
        close={() => open(null)}
        openOccurrence={openOccurrence}
        renameTag={renameTag}
      />
    </div>
  );
}

type CardProps = { selected: boolean; click: () => void };

function JarCard({ jar, selected, click }: { jar: JarGroup } & CardProps) {
  const noLimit = jar.limit === null;
  const className = noLimit ? "no-limit" : jar.verdict === "overrun" ? "overrun" : "";
  return (
    <button
      type="button"
      className={`card jar ${className} ${selected ? "open" : ""}`}
      style={jarColor(jar.key)}
      aria-pressed={selected}
      onClick={click}
    >
      <span className="card-top">
        <span>
          <span className="swatch" />
          {jar.name}
        </span>
        <span className="num">{jar.percentage}%</span>
      </span>
      <span className="card-total num">
        <Amount cents={jar.total} />
      </span>
      <Bar jar={jar} />
      <span className="card-foot">
        <Verdict jar={jar} />
        <span className="limit">{noLimit ? "sem limite" : `limite ${formatReais(jar.limit!)}`}</span>
      </span>
    </button>
  );
}

/** Payment method and tag have no limit or verdict: only total and count. Which is why a jar never gets here. */
function GroupCard({ group, axis, selected, click }: { group: Group; axis: Axis } & CardProps) {
  const tinted = axis === "tag" && group.key !== null;
  return (
    <button
      type="button"
      className={`card group ${tinted ? "tag" : ""} ${selected ? "open" : ""}`}
      style={tinted ? tagColor(group.key!) : undefined}
      aria-pressed={selected}
      onClick={click}
    >
      <span className="card-top">
        <span>
          {tinted && <span className="swatch" />}
          {group.name}
        </span>
      </span>
      <span className="card-total num">
        <Amount cents={group.total} />
      </span>
      <span className="card-foot">
        <span>{count(group.occurrences.length)}</span>
      </span>
    </button>
  );
}

/**
 * The jar's bar: the total against the limit. When the total goes past the
 * limit, the scale becomes the total and the vertical mark shows where the
 * limit was.
 */
function Bar({ jar }: { jar: JarGroup }) {
  if (jar.limit === null) return <span className="bar" />;
  const spent = Math.max(jar.total, 0);
  const scale = Math.max(jar.limit, spent);
  const fraction = (v: number) => (scale > 0 ? (v / scale) * 100 : 0);
  return (
    <span className="bar">
      <i style={{ width: `${fraction(spent)}%` }} />
      <b style={{ left: `calc(${fraction(jar.limit)}% - 1px)` }} />
    </span>
  );
}

function Verdict({ jar }: { jar: JarGroup }) {
  switch (jar.verdict) {
    case "no-income":
      return <span className="badge no-income">— Sem receita</span>;
    case "leftover":
      return <span className="badge leftover">✓ Sobra {formatReais(jar.limit! - jar.total)}</span>;
    case "overrun":
      return <span className="badge overrun">▲ Estourou {formatReais(jar.overrun!)}</span>;
  }
}

type DetailProps = {
  view: MonthView;
  group: Group;
  /** null is "Todos os gastos do mês", which is no axis's group. */
  axis: Axis | null;
  close: () => void;
  openOccurrence: (occurrence: Occurrence) => void;
  renameTag: (tag: string) => void;
};

/**
 * The jar's header has percentage, limit and verdict; the others, total and
 * count. Only a tag's renames: jar and payment method are the app's fixed
 * lists, and "sem tag" is not a tag.
 */
function Detail({ view, group, axis, close, openOccurrence, renameTag }: DetailProps) {
  const jar = isJarGroup(group) ? group : null;
  const tag = axis === "tag" ? group.key : null;
  return (
    <section className="detail" aria-label={group.name}>
      <header>
        <span className="handle" aria-hidden />
        <button type="button" className="close" onClick={close} aria-label="Fechar o detalhe e voltar à grade">
          ×
        </button>
        <div className="kicker">{axis ? axisName(axis) : "Despesas"}</div>
        <h2 style={jar ? jarColor(jar.key) : tag ? tagColor(tag) : undefined}>
          {(jar || tag) && <span className="swatch" />}
          {group.name}
        </h2>
        <div className="detail-summary">
          <span className="detail-total num">
            <Amount cents={group.total} />
          </span>
          {jar && <Verdict jar={jar} />}
          <span className="hint">{count(group.occurrences.length)}</span>
          {tag && (
            <button
              type="button"
              className="btn rename"
              onClick={() => renameTag(tag)}
              title="Trocar o nome desta tag no histórico todo"
            >
              Renomear
            </button>
          )}
        </div>
        {jar && (
          <p className="hint">
            {jar.limit === null
              ? `${jar.percentage}% · sem receita, sem limite`
              : `${jar.percentage}% de ${formatReais(view.monthIncome)} · limite ${formatReais(jar.limit)}`}
          </p>
        )}
        {group.total < 0 && <p className="refund-note">Só reembolso neste mês; não é entrada e não move a receita.</p>}
      </header>
      {group.occurrences.map((o) => (
        // A month can hold both the installment and the prepayment of the same purchase: the key tells them apart.
        <button
          type="button"
          key={o.prepayment ? `prepayment-${o.prepayment.id}` : o.expense}
          className="occurrence"
          onClick={() => openOccurrence(o)}
          title={o.prepayment ? "Rever a antecipação" : "Corrigir o gasto"}
        >
          <span className="date num">
            {o.date.slice(8)}/{o.date.slice(5, 7)}
          </span>
          <span className="occurrence-body">
            <span>{o.description}</span>
            <span className="occurrence-axes">
              <span style={jarColor(o.jar)}>
                <span className="swatch" />
                {jarName(o.jar)}
              </span>
              <span>{paymentMethodName(o.paymentMethod)}</span>
              <TagPill tag={o.tag} />
            </span>
            {o.installment && (
              <span className="annotation num">
                ⤷ {o.installment.number}/{o.installment.of} de {formatReais(o.installment.total)}
              </span>
            )}
            {o.recurring && (
              <span className="annotation">
                ⤷ recorrente desde {monthName(o.recurring.since)}
                {o.recurring.periodSince !== o.recurring.since && ` · valor desde ${monthName(o.recurring.periodSince)}`}
              </span>
            )}
            {o.prepayment && (
              <span className="annotation num">
                ⤷ Antecipação {installmentRange(o.prepayment)}/{o.prepayment.of} de {formatReais(o.prepayment.total)}
              </span>
            )}
          </span>
          <span className="right num">
            <Amount cents={o.amount} />
          </span>
        </button>
      ))}
      {group.occurrences.length === 0 && <p className="empty-detail">Nada aqui neste mês.</p>}
    </section>
  );
}

const count = (n: number) => plural(n, "ocorrência");
