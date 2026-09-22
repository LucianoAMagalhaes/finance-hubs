"use client";

import { useState, useSyncExternalStore } from "react";
import {
  proposedDate,
  formatReais,
  expensesWithTag,
  monthOf,
  incomeSourceName,
  monthName,
  paymentMethodName,
  addMonths,
  tagsInUse,
  tagsInHistory,
  type MonthAggregates,
  type Cents,
  type IsoDate,
  type Axis,
  type Income,
  type State,
  type MonthView,
} from "@/domain";
import { execute } from "@/server/actions";
import { ThemeToggle } from "./ThemeToggle";
import { FloatingButton } from "./FloatingButton";
import { PercentagesEditor } from "./PercentagesEditor";
import { createMonthFlow } from "./monthFlow";
import { PrepaymentForm } from "./PrepaymentForm";
import { IncomeForm } from "./IncomeForm";
import { ExpenseForm } from "./ExpenseForm";
import { RenameTagForm } from "./RenameTagForm";
import { Trash } from "./Trash";
import { MasterDetail, AXIS_NAME } from "./MasterDetail";
import { RecordButtons, Amount } from "./parts";

type Props = { initialState: State; today: IsoDate };

/**
 * The month screen: it only draws the month flow, which keeps the state,
 * projects the month and sends the commands to the server.
 */
export function MonthScreen({ initialState, today }: Props) {
  const [flow] = useState(() => createMonthFlow(initialState, { today, execute }));
  const { state, month, view, trash, form, notice, draft, axis, opened, trashOpen, tagToRename } = useSyncExternalStore(
    flow.subscribe,
    flow.snapshot,
    flow.snapshot,
  );
  const currentMonth = monthOf(today);
  const newIncome = () => flow.openIncome(null);
  const newExpense = () => flow.openExpense(null);

  return (
    <main className="wrap">
      <header className="topbar">
        <nav className="month-nav" aria-label="Mês">
          <button type="button" className="btn arrow" onClick={() => flow.changeMonth(addMonths(month, -1))} aria-label="Mês anterior">
            ‹
          </button>
          <h1>{capitalize(monthName(month))}</h1>
          <button type="button" className="btn arrow" onClick={() => flow.changeMonth(addMonths(month, 1))} aria-label="Próximo mês">
            ›
          </button>
          {month !== currentMonth && (
            <button type="button" className="btn" onClick={() => flow.changeMonth(currentMonth)}>
              Hoje
            </button>
          )}
        </nav>
        <div className="status">
          <span className="chip">{month === currentMonth ? "mês em curso" : month < currentMonth ? "mês passado · editável" : "mês futuro"}</span>
          {!view.budget.born && (
            <span className="chip unborn">
              ainda não nasceu · herdaria{" "}
              {view.budget.inheritedFrom ? `de ${monthName(view.budget.inheritedFrom)}` : "os padrão"}
            </span>
          )}
        </div>
        <div className="actions">
          <ThemeToggle />
          <button type="button" className="btn" onClick={flow.openTrash} title="O que foi apagado, para restaurar">
            Lixeira{trash.length > 0 && <span className="count num">{trash.length}</span>}
          </button>
          <RecordButtons newIncome={newIncome} newExpense={newExpense} />
        </div>
      </header>

      {notice && (
        <div className="saved-notice" role="status">
          <span>
            {notice.text} A tela continua em {monthName(month)}.
          </span>
          <button type="button" className="btn" onClick={() => flow.changeMonth(notice.month)}>
            Ir para {monthName(notice.month)}
          </button>
          <button type="button" className="close" onClick={flow.dismissNotice} aria-label="Dispensar aviso">
            ×
          </button>
        </div>
      )}

      <Section title="O mês" first />
      <AggregatesBand
        aggregates={view.aggregates}
        incomes={view.incomes.length}
        expensesOpen={opened?.kind === "all"}
        openExpenses={flow.toggleExpenses}
      />

      <Section title={axis === "jar" ? "Os potes" : `Por ${AXIS_NAME[axis].toLowerCase()}`}>
        <AxisPicker axis={axis} change={flow.changeAxis} />
        {axis === "jar" && !draft && (
          <button type="button" className="btn" onClick={flow.editPercentages}>
            Editar percentuais
          </button>
        )}
        {axis === "jar" ? (
          <span className="extra num">
            {view.jars.map((j) => j.percentage).join(" / ")}
            {view.unallocated.percentage > 0 && (
              <strong className="unallocated">
                {" "}
                · {view.unallocated.percentage}% não alocado
                {view.unallocated.amount !== null && ` (${formatReais(view.unallocated.amount)})`}
              </strong>
            )}
          </span>
        ) : (
          <span className="extra">Sem limite e sem veredito: só pote tem percentual da receita.</span>
        )}
      </Section>
      {draft && (
        <PercentagesEditor
          draft={draft}
          change={flow.changeDraft}
          save={flow.savePercentages}
          cancel={flow.cancelDraft}
        />
      )}
      {view.monthIncome === 0 && (
        <p className="notice">
          Nenhuma entrada em {monthName(month)}: sem receita, os potes não têm limite nem veredito.
        </p>
      )}
      <MasterDetail
        view={view}
        axis={axis}
        opened={opened}
        open={flow.open}
        openOccurrence={flow.openOccurrence}
        renameTag={flow.openRename}
      />

      <Section title="Entradas do mês">
        <button type="button" className="btn income" onClick={newIncome}>
          + Entrada
        </button>
      </Section>
      <IncomeList view={view} open={flow.openIncome} />

      {form?.record === "income" && (
        <IncomeForm
          income={form.income}
          proposedDate={proposedDate(month, today)}
          save={(income) => flow.save({ type: "save-income", income }, monthOf(income.date))}
          delete={flow.delete}
          close={flow.closeForm}
        />
      )}
      {form?.record === "expense" && (
        <ExpenseForm
          expense={form.expense}
          month={month}
          tags={tagsInUse(state)}
          proposedDate={proposedDate(month, today)}
          save={flow.save}
          delete={flow.delete}
          end={flow.end}
          prepay={flow.prepay}
          close={flow.closeForm}
        />
      )}
      {form?.record === "prepayment" && (
        <PrepaymentForm
          purchase={form.purchase}
          prepayment={form.prepayment}
          proposedDate={proposedDate(month, today)}
          today={today}
          save={flow.save}
          undo={flow.delete}
          close={flow.closeForm}
        />
      )}
      {tagToRename !== null && (
        <RenameTagForm
          tag={tagToRename}
          tags={tagsInUse(state)}
          historyTags={tagsInHistory(state)}
          expensesWithTag={(tag) => expensesWithTag(state, tag)}
          rename={flow.renameTag}
          close={flow.closeRename}
        />
      )}
      {trashOpen && <Trash items={trash} restore={flow.restore} close={flow.closeTrash} />}

      {/* In a narrow window, recording goes through here; in the wide layout, through the top bar. */}
      <FloatingButton newIncome={newIncome} newExpense={newExpense} />
    </main>
  );
}

function Section({ title, first, children }: { title: string; first?: boolean; children?: React.ReactNode }) {
  return (
    <div className={first ? "section first" : "section"}>
      <h2>{title}</h2>
      <span className="rule" />
      {children}
    </div>
  );
}

type BandProps = {
  aggregates: MonthAggregates;
  incomes: number;
  expensesOpen: boolean;
  openExpenses: () => void;
};

/** The "Despesas" card opens "Todos os gastos do mês" in the master-detail. */
function AggregatesBand({ aggregates, incomes, expensesOpen, openExpenses }: BandProps) {
  const cards = [
    {
      label: "Receitas",
      value: <span className="val income">{formatReais(aggregates.monthIncome)}</span>,
      hint: incomes === 1 ? "1 entrada" : `${incomes} entradas`,
    },
    { label: "Despesas", value: <Amount cents={aggregates.monthExpenses} />, hint: "líquido · ver todos os gastos", open: openExpenses },
    { label: "Saldo do mês", value: <Balance cents={aggregates.monthBalance} />, hint: "receitas − despesas" },
    { label: "Saldo em conta", value: <Balance cents={aggregates.accountBalance} />, hint: "sem cartão · aproximado" },
  ];
  return (
    <div className="band">
      {cards.map((c) => {
        const content = (
          <>
            <span className="k">{c.label}</span>
            <span className="v num">{c.value}</span>
            <span className="h">{c.hint}</span>
          </>
        );
        return c.open ? (
          <button type="button" className={`aggregate clickable ${expensesOpen ? "open" : ""}`} key={c.label} onClick={c.open} aria-pressed={expensesOpen}>
            {content}
          </button>
        ) : (
          <div className="aggregate" key={c.label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** The month's incomes, with the source as a column. Source has no drill-down (ADR-0003). */
function IncomeList({ view, open }: { view: MonthView; open: (income: Income) => void }) {
  return (
    <div className="table">
      <div className="row head" aria-hidden>
        <span>Data</span>
        <span>Descrição</span>
        <span>Fonte</span>
        <span>Tipo</span>
        <span className="right">Valor</span>
      </div>
      {view.incomes.map((i) => (
        <button type="button" key={i.id} className="row clickable" onClick={() => open(i)} title="Corrigir a entrada">
          <span className="date num">
            {i.date.slice(8)}/{i.date.slice(5, 7)}
          </span>
          <span>{i.description}</span>
          <span>
            <span className="source-pill">{incomeSourceName(i.source)}</span>
          </span>
          <span className="method">{paymentMethodName(i.paymentMethod)}</span>
          <span className="right num val income">+ {formatReais(i.amount)}</span>
        </button>
      ))}
      {view.incomes.length === 0 && (
        <div className="row empty">
          <span />
          <span>Nenhuma entrada. Sem entrada, sem receita, sem limite.</span>
        </div>
      )}
      <div className="row foot">
        <span />
        <span>Receita do mês</span>
        <span />
        <span />
        <span className="right num val income">{formatReais(view.monthIncome)}</span>
      </div>
    </div>
  );
}

function AxisPicker({ axis, change }: { axis: Axis; change: (axis: Axis) => void }) {
  return (
    <div className="axis-picker" role="group" aria-label="Agrupar os gastos por">
      {(Object.keys(AXIS_NAME) as Axis[]).map((a) => (
        <button type="button" key={a} aria-pressed={a === axis} onClick={() => change(a)}>
          {AXIS_NAME[a]}
        </button>
      ))}
    </div>
  );
}

/** Balance: negative is a deficit, in red. */
function Balance({ cents }: { cents: Cents }) {
  return <span className={cents < 0 ? "deficit" : undefined}>{formatReais(cents)}</span>;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
