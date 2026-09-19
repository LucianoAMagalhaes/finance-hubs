import type { Centavos } from "./dinheiro";
import { distanciaEntreMeses, mesDaData, mesmoDiaEm, type Data, type Mes } from "./mes";
import type { TipoDePagamento } from "./pagamento";
import type { PoteId } from "./potes";

/**
 * Um gasto (ADR-0003). É a única coisa gravada: a ocorrência é derivada
 * (ADR-0002). O à vista é uma compra de uma parcela; o parcelado, de várias.
 */
export type Lancamento = {
  id: number;
  data: Data;
  descricao: string;
  pote: PoteId;
  tipo: TipoDePagamento;
  /** O total da compra, nunca a parcela. Negativo quando é reembolso. */
  valor: Centavos;
  /** Em quantas parcelas o total se divide; 1 é à vista. */
  parcelas: number;
  /** No máximo uma, normalizada (ver `normalizarTag`); null é sem tag. */
  tag: string | null;
};

/** O que a pessoa preenche no formulário; o id vem do domínio num lançamento novo. */
export type NovoLancamento = Omit<Lancamento, "id">;

/**
 * O que se manda salvar: sem id, é um lançamento novo; com id, corrige o que já
 * existe. A tag vem como a pessoa digitou; o domínio a normaliza.
 */
export type LancamentoASalvar = Omit<NovoLancamento, "tag"> & { id?: number; tag?: string | null };

/** O impacto de um lançamento num mês. Nunca gravada, sempre derivada. */
export type Ocorrencia = {
  /** O id do lançamento de onde ela vem. */
  lancamento: number;
  data: Data;
  descricao: string;
  pote: PoteId;
  tipo: TipoDePagamento;
  tag: string | null;
  valor: Centavos;
  /** Qual parcela ela é, de quantas e de que total; null no à vista. */
  parcela: { numero: number; de: number; total: Centavos } | null;
};

/**
 * As ocorrências de uma compra no mês: a parcela n cai n − 1 meses depois do
 * mês da compra, no mesmo dia (limitado ao último dia do mês). O à vista é a
 * parcela 1 de 1.
 */
export function ocorrenciasNoMes(l: Lancamento, mes: Mes): Ocorrencia[] {
  const numero = distanciaEntreMeses(mesDaData(l.data), mes) + 1;
  if (numero < 1 || numero > l.parcelas) return [];
  const { primeira, demais } = divisaoEmParcelas(l.valor, l.parcelas);
  return [
    {
      lancamento: l.id,
      data: mesmoDiaEm(l.data, mes),
      descricao: l.descricao,
      pote: l.pote,
      tipo: l.tipo,
      tag: l.tag,
      valor: numero === 1 ? primeira : demais,
      parcela: l.parcelas > 1 ? { numero, de: l.parcelas, total: l.valor } : null,
    },
  ];
}

/**
 * O total dividido em n parcelas: todas iguais, menos a primeira, que leva o
 * centavo que sobra, de modo que elas sempre somam o total. O sinal é
 * preservado: um reembolso divide igual. Com n = 1, a primeira é o total.
 */
export function divisaoEmParcelas(total: Centavos, n: number): { primeira: Centavos; demais: Centavos } {
  // `|| 0`: um centavo negativo em 2× não deixa uma parcela de −0.
  const demais = Math.trunc(total / n) || 0;
  return { primeira: total - demais * (n - 1), demais };
}
