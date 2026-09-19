import type { Entrada, Estado, Lancamento, Mes, Percentuais } from "@/dominio";
import type { Banco } from "./banco";
import { entrada, lancamento, orcamentoDoMes } from "./esquema";

// Sem regra de negócio aqui: validar e derivar é do domínio. Este módulo só
// traduz o estado para linhas e de volta.

type LinhaOrcamento = typeof orcamentoDoMes.$inferSelect;
type LinhaEntrada = typeof entrada.$inferSelect;
type LinhaLancamento = typeof lancamento.$inferSelect;

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

function paraLancamento({ tipoDePagamento, ...linha }: LinhaLancamento): Lancamento {
  return { ...linha, tipo: tipoDePagamento } as Lancamento;
}

function paraLinhaDeLancamento({ tipo, ...l }: Lancamento): LinhaLancamento {
  return { ...l, tipoDePagamento: tipo };
}

export function carregarEstado({ db }: Banco): Estado {
  const orcamentos: Estado["orcamentos"] = {};
  for (const linha of db.select().from(orcamentoDoMes).all()) {
    orcamentos[linha.mes as Mes] = paraPercentuais(linha);
  }
  const entradas = db.select().from(entrada).orderBy(entrada.id).all().map(paraEntrada);
  const lancamentos = db.select().from(lancamento).orderBy(lancamento.id).all().map(paraLancamento);
  return { orcamentos, entradas, lancamentos };
}

/**
 * Grava o estado que um comando devolveu, numa transação só: ou tudo entra,
 * ou nada entra. Nada é apagado (orçamento nunca, o resto vai para a lixeira
 * como marca), então só se insere ou se troca.
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
      const linha = paraLinhaDeLancamento(l);
      tx.insert(lancamento).values(linha).onConflictDoUpdate({ target: lancamento.id, set: linha }).run();
    }
  });
}
