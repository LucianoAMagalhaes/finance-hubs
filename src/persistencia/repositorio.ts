import { eq } from "drizzle-orm";
import type { Antecipacao, Compra, Entrada, Estado, Lancamento, Mes, Percentuais, Recorrente, Vigencia } from "@/dominio";
import type { Banco } from "./banco";
import { antecipacao, entrada, lancamento, orcamentoDoMes, recorrente, vigencia } from "./esquema";

// Sem regra de negócio aqui: validar e derivar é do domínio. Este módulo só
// traduz o estado para linhas e de volta.

type LinhaOrcamento = typeof orcamentoDoMes.$inferSelect;
type LinhaEntrada = typeof entrada.$inferSelect;
type LinhaLancamento = typeof lancamento.$inferSelect;
type LinhaRecorrente = typeof recorrente.$inferSelect;
type LinhaVigencia = typeof vigencia.$inferSelect;
type LinhaAntecipacao = typeof antecipacao.$inferSelect;

function paraPercentuais(linha: LinhaOrcamento): Percentuais {
  return {
    "custos-fixos": linha.custosFixos,
    "liberdade-financeira": linha.liberdadeFinanceira,
    conforto: linha.conforto,
    metas: linha.metas,
    conhecimento: linha.conhecimento,
    prazeres: linha.prazeres,
  };
}

function paraLinha(mes: Mes, p: Percentuais): LinhaOrcamento {
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

function paraEntrada({ tipoDePagamento, ...linha }: LinhaEntrada): Entrada {
  return { ...linha, tipo: tipoDePagamento } as Entrada;
}

function paraLinhaDeEntrada({ tipo, ...e }: Entrada): LinhaEntrada {
  return { ...e, tipoDePagamento: tipo };
}

/** As antecipações vêm em ordem de id: a de aplicação é derivada pelo domínio. */
function paraCompra({ tipoDePagamento, ...linha }: LinhaLancamento, antecipacoes: LinhaAntecipacao[]): Compra {
  return {
    ...linha,
    forma: "compra",
    tipo: tipoDePagamento,
    antecipacoes: antecipacoes.map(({ lancamento: _, ...a }) => a as Antecipacao),
  } as Compra;
}

function paraLinhaDeCompra({ tipo, forma: _, antecipacoes: __, ...c }: Compra): LinhaLancamento {
  return { ...c, tipoDePagamento: tipo };
}

function paraLinhaDeAntecipacao(id: number, a: Antecipacao): LinhaAntecipacao {
  return { ...a, lancamento: id };
}

/** As vigências vêm em ordem de início: "AAAA-MM" ordena como o tempo. */
function paraRecorrente(linha: LinhaRecorrente, vigencias: LinhaVigencia[]): Recorrente {
  return {
    ...linha,
    forma: "recorrente",
    vigencias: vigencias.map(({ recorrente: _, tipoDePagamento, ...v }) => ({ ...v, tipo: tipoDePagamento }) as Vigencia),
  } as Recorrente;
}

function paraLinhaDeRecorrente({ id, dia, encerradoEm, apagadoEm }: Recorrente): LinhaRecorrente {
  return { id, dia, encerradoEm, apagadoEm };
}

function paraLinhaDeVigencia(id: number, { tipo, ...v }: Vigencia): LinhaVigencia {
  return { ...v, recorrente: id, tipoDePagamento: tipo };
}

export function carregarEstado({ db }: Banco): Estado {
  const orcamentos: Estado["orcamentos"] = {};
  for (const linha of db.select().from(orcamentoDoMes).all()) {
    orcamentos[linha.mes as Mes] = paraPercentuais(linha);
  }
  const entradas = db.select().from(entrada).orderBy(entrada.id).all().map(paraEntrada);
  const vigencias = db.select().from(vigencia).orderBy(vigencia.recorrente, vigencia.desde).all();
  const antecipacoes = db.select().from(antecipacao).orderBy(antecipacao.id).all();
  const lancamentos: Lancamento[] = [
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
  return { orcamentos, entradas, lancamentos };
}

/**
 * Grava o estado que um comando devolveu, numa transação só: ou tudo entra,
 * ou nada entra. Quase nada é apagado (orçamento nunca, o resto vai para a
 * lixeira como marca), então só se insere ou se troca. A exceção são as
 * vigências, que se regravam por recorrente: a descartada ao encerrar some.
 */
export function gravarEstado({ db }: Banco, estado: Estado): void {
  db.transaction((tx) => {
    for (const [mes, percentuais] of Object.entries(estado.orcamentos)) {
      if (!percentuais) continue;
      const linha = paraLinha(mes as Mes, percentuais);
      tx.insert(orcamentoDoMes)
        .values(linha)
        .onConflictDoUpdate({ target: orcamentoDoMes.mes, set: linha })
        .run();
    }
    for (const e of estado.entradas) {
      const linha = paraLinhaDeEntrada(e);
      tx.insert(entrada).values(linha).onConflictDoUpdate({ target: entrada.id, set: linha }).run();
    }
    for (const l of estado.lancamentos) {
      if (l.forma === "compra") {
        const linha = paraLinhaDeCompra(l);
        tx.insert(lancamento).values(linha).onConflictDoUpdate({ target: lancamento.id, set: linha }).run();
        for (const a of l.antecipacoes) {
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
      tx.insert(vigencia).values(l.vigencias.map((v) => paraLinhaDeVigencia(l.id, v))).run();
    }
  });
}
