import type { Estado, Mes, Percentuais } from "@/dominio";
import type { Banco } from "./banco";
import { orcamentoDoMes } from "./esquema";

// Sem regra de negócio aqui: validar e derivar é do domínio. Este módulo só
// traduz o estado para linhas e de volta.

type LinhaOrcamento = typeof orcamentoDoMes.$inferSelect;

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

export function carregarEstado({ db }: Banco): Estado {
  const orcamentos: Estado["orcamentos"] = {};
  for (const linha of db.select().from(orcamentoDoMes).all()) {
    orcamentos[linha.mes as Mes] = paraPercentuais(linha);
  }
  return { orcamentos };
}

/**
 * Grava o estado que um comando devolveu, numa transação só: ou tudo entra,
 * ou nada entra. Orçamento nunca é apagado, então só se insere ou se troca.
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
  });
}
