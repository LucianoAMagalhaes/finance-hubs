import type { Centavos } from "./dinheiro";
import type { Ocorrencia } from "./lancamentos";
import { nomeDoTipo, TIPOS_DE_PAGAMENTO } from "./pagamento";
import type { VistaDoMes } from "./projecao";
import { tagsDistintas } from "./tags";

/** Uma dimensão pela qual as ocorrências do mês se agrupam. */
export type Eixo = "pote" | "tipo" | "tag";

export type Grupo = {
  /** O pote, o tipo de pagamento ou a tag; null é o grupo "sem tag". */
  chave: string | null;
  nome: string;
  /** Soma líquida das ocorrências do grupo; negativa quando só há reembolso. */
  total: Centavos;
  /** Em ordem de data, como na vista. */
  ocorrencias: Ocorrencia[];
};

/**
 * Os grupos de um eixo no mês. Toda ocorrência cai em exatamente um grupo, então
 * os totais de qualquer eixo somam as despesas do mês. Pote mostra os seis,
 * mesmo vazios; tipo e tag só os que têm ocorrência, com "sem tag" por último.
 */
export function grupos(vista: VistaDoMes, eixo: Eixo): Grupo[] {
  switch (eixo) {
    case "pote":
      return vista.potes.map((p) => grupo(p.id, p.nome, vista.ocorrencias.filter((o) => o.pote === p.id)));
    case "tipo":
      return TIPOS_DE_PAGAMENTO.map((t) => grupo(t.id, nomeDoTipo(t.id), vista.ocorrencias.filter((o) => o.tipo === t.id))).filter(
        (g) => g.ocorrencias.length > 0,
      );
    case "tag": {
      const tags = tagsDistintas(vista.ocorrencias);
      const semTag = vista.ocorrencias.filter((o) => o.tag === null);
      return [
        ...tags.map((t) => grupo(t, `#${t}`, vista.ocorrencias.filter((o) => o.tag === t))),
        ...(semTag.length > 0 ? [grupo(null, "sem tag", semTag)] : []),
      ];
    }
  }
}

/** O feed do mês: todas as ocorrências, sem agrupar. Soma as despesas do mês. */
export function todosOsGastos(vista: VistaDoMes): Grupo {
  return grupo(null, "Todos os gastos do mês", vista.ocorrencias);
}

function grupo(chave: string | null, nome: string, ocorrencias: Ocorrencia[]): Grupo {
  return { chave, nome, total: ocorrencias.reduce((soma, o) => soma + o.valor, 0), ocorrencias };
}
