import { eq } from "drizzle-orm";
import type { Prepayment, Purchase, Income, State, Expense, Month, Percentages, Recurring, Period } from "@/domain";
import type { Banco, Conexao } from "./banco";
import { antecipacao, entrada, lancamento, orcamentoDoMes, recorrente, vigencia } from "./esquema";

// Sem regra de negócio aqui: validar e derivar é do domínio. Este módulo só
// traduz o estado para linhas e de volta.

type LinhaOrcamento = typeof orcamentoDoMes.$inferSelect;
type LinhaEntrada = typeof entrada.$inferSelect;
type LinhaLancamento = typeof lancamento.$inferSelect;
type LinhaRecorrente = typeof recorrente.$inferSelect;
type LinhaVigencia = typeof vigencia.$inferSelect;
type LinhaAntecipacao = typeof antecipacao.$inferSelect;

function paraPercentuais(linha: LinhaOrcamento): Percentages {
  return {
    "custos-fixos": linha.custosFixos,
    "liberdade-financeira": linha.liberdadeFinanceira,
    conforto: linha.conforto,
    metas: linha.metas,
    conhecimento: linha.conhecimento,
    prazeres: linha.prazeres,
  };
}

function paraLinha(mes: Month, p: Percentages): LinhaOrcamento {
  return {
    mes,
    custosFixos: p["custos-fixos"],
    liberdadeFinanceira: p["liberdade-financeira"],
    conforto: p.conforto,
    metas: p.metas,
    conhecimento: p.conhecimento,
    prazeres: p.prazeres,
  };
}

function paraEntrada(linha: LinhaEntrada): Income {
  return {
    id: linha.id,
    date: linha.data,
    description: linha.descricao,
    source: linha.fonte,
    paymentMethod: linha.tipoDePagamento,
    amount: linha.valor,
    deletedAt: linha.apagadoEm,
  } as Income;
}

function paraLinhaDeEntrada(e: Income): LinhaEntrada {
  return {
    id: e.id,
    data: e.date,
    descricao: e.description,
    fonte: e.source,
    tipoDePagamento: e.paymentMethod,
    valor: e.amount,
    apagadoEm: e.deletedAt,
  };
}

/** As antecipações vêm em ordem de id: a de aplicação é derivada pelo domínio. */
function paraCompra(linha: LinhaLancamento, antecipacoes: LinhaAntecipacao[]): Purchase {
  return {
    id: linha.id,
    kind: "purchase",
    date: linha.data,
    description: linha.descricao,
    jar: linha.pote,
    paymentMethod: linha.tipoDePagamento,
    amount: linha.valor,
    installments: linha.parcelas,
    tag: linha.tag,
    prepayments: antecipacoes.map(
      (a) => ({ id: a.id, date: a.data, installments: a.parcelas, amount: a.valor, deletedAt: a.apagadoEm }) as Prepayment,
    ),
    deletedAt: linha.apagadoEm,
  } as Purchase;
}

function paraLinhaDeCompra(c: Purchase): LinhaLancamento {
  return {
    id: c.id,
    data: c.date,
    descricao: c.description,
    pote: c.jar,
    tipoDePagamento: c.paymentMethod,
    valor: c.amount,
    parcelas: c.installments,
    tag: c.tag,
    apagadoEm: c.deletedAt,
  };
}

function paraLinhaDeAntecipacao(id: number, a: Prepayment): LinhaAntecipacao {
  return { id: a.id, lancamento: id, data: a.date, parcelas: a.installments, valor: a.amount, apagadoEm: a.deletedAt };
}

/** As vigências vêm em ordem de início: "AAAA-MM" ordena como o tempo. */
function paraRecorrente(linha: LinhaRecorrente, vigencias: LinhaVigencia[]): Recurring {
  return {
    id: linha.id,
    kind: "recurring",
    day: linha.dia,
    periods: vigencias.map(
      (v) =>
        ({
          since: v.desde,
          description: v.descricao,
          jar: v.pote,
          paymentMethod: v.tipoDePagamento,
          amount: v.valor,
          tag: v.tag,
        }) as Period,
    ),
    endedIn: linha.encerradoEm,
    deletedAt: linha.apagadoEm,
  } as Recurring;
}

function paraLinhaDeRecorrente({ id, day: dia, endedIn: encerradoEm, deletedAt: apagadoEm }: Recurring): LinhaRecorrente {
  return { id, dia, encerradoEm, apagadoEm };
}

function paraLinhaDeVigencia(id: number, v: Period): LinhaVigencia {
  return {
    recorrente: id,
    desde: v.since,
    descricao: v.description,
    pote: v.jar,
    tipoDePagamento: v.paymentMethod,
    valor: v.amount,
    tag: v.tag,
  };
}

export const carregarEstado = ({ db }: Banco): State => carregar(db);

export function carregar(db: Conexao): State {
  const orcamentos: State["budgets"] = {};
  for (const linha of db.select().from(orcamentoDoMes).all()) {
    orcamentos[linha.mes as Month] = paraPercentuais(linha);
  }
  const entradas = db.select().from(entrada).orderBy(entrada.id).all().map(paraEntrada);
  const vigencias = db.select().from(vigencia).orderBy(vigencia.recorrente, vigencia.desde).all();
  const antecipacoes = db.select().from(antecipacao).orderBy(antecipacao.id).all();
  const lancamentos: Expense[] = [
    ...db
      .select()
      .from(lancamento)
      .all()
      .map((l) => paraCompra(l, antecipacoes.filter((a) => a.lancamento === l.id))),
    ...db
      .select()
      .from(recorrente)
      .all()
      .map((r) => paraRecorrente(r, vigencias.filter((v) => v.recorrente === r.id))),
  ].sort((a, b) => a.id - b.id);
  return { budgets: orcamentos, incomes: entradas, expenses: lancamentos };
}

/**
 * Grava o estado que os comandos devolveram, dentro da transação de quem
 * chama. Quase nada é apagado (orçamento nunca, o resto vai para a lixeira
 * como marca), então só se insere ou se troca. A exceção são as vigências,
 * que se regravam por recorrente: a descartada ao encerrar some.
 */
export function gravar(tx: Conexao, estado: State): void {
  for (const [mes, percentuais] of Object.entries(estado.budgets)) {
    if (!percentuais) continue;
    const linha = paraLinha(mes as Month, percentuais);
    tx.insert(orcamentoDoMes)
      .values(linha)
      .onConflictDoUpdate({ target: orcamentoDoMes.mes, set: linha })
      .run();
  }
  for (const e of estado.incomes) {
    const linha = paraLinhaDeEntrada(e);
    tx.insert(entrada).values(linha).onConflictDoUpdate({ target: entrada.id, set: linha }).run();
  }
  for (const l of estado.expenses) {
    if (l.kind === "purchase") {
      const linha = paraLinhaDeCompra(l);
      tx.insert(lancamento).values(linha).onConflictDoUpdate({ target: lancamento.id, set: linha }).run();
      for (const a of l.prepayments) {
        const linhaDaAntecipacao = paraLinhaDeAntecipacao(l.id, a);
        tx.insert(antecipacao)
          .values(linhaDaAntecipacao)
          .onConflictDoUpdate({ target: antecipacao.id, set: linhaDaAntecipacao })
          .run();
      }
      continue;
    }
    const linha = paraLinhaDeRecorrente(l);
    tx.insert(recorrente).values(linha).onConflictDoUpdate({ target: recorrente.id, set: linha }).run();
    tx.delete(vigencia).where(eq(vigencia.recorrente, l.id)).run();
    tx.insert(vigencia).values(l.periods.map((v) => paraLinhaDeVigencia(l.id, v))).run();
  }
}
