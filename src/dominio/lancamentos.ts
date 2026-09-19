import type { Centavos } from "./dinheiro";
import { diaEm, distanciaEntreMeses, mesDaData, mesmoDiaEm, somarMeses, type Data, type Mes } from "./mes";
import type { TipoDePagamento } from "./pagamento";
import type { PoteId } from "./potes";

/**
 * Um gasto (ADR-0003). É a única coisa gravada: a ocorrência é derivada
 * (ADR-0002). A forma não muda depois de salva: uma compra não vira
 * recorrente, nem o contrário.
 */
export type Lancamento = Compra | Recorrente;

/** O à vista é uma compra de uma parcela; o parcelado, de várias. */
export type Compra = {
  id: number;
  forma: "compra";
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
  /** A marca de lixeira: o dia em que foi apagado; null enquanto está vivo. */
  apagadoEm: Data | null;
};

/**
 * Um valor que se repete todo mês, sem fim até ser encerrado. O dia é da
 * recorrência e não muda; o resto muda por vigências.
 */
export type Recorrente = {
  id: number;
  forma: "recorrente";
  /** O dia do mês em que cai; limitado ao último dia de meses mais curtos. */
  dia: number;
  /** Em ordem de início, nunca vazia; a primeira começa no mês de início. */
  vigencias: Vigencia[];
  /** O primeiro mês em que ele já não cai; null é sem fim. */
  encerradoEm: Mes | null;
  apagadoEm: Data | null;
};

/** Uma vigência: o que o recorrente é de `desde` até a próxima vigência. */
export type Vigencia = {
  desde: Mes;
  descricao: string;
  pote: PoteId;
  tipo: TipoDePagamento;
  /** Nunca zero; negativo quando é reembolso. */
  valor: Centavos;
  tag: string | null;
};

/** O que a pessoa preenche no formulário de compra; o id vem do domínio numa compra nova. */
export type NovoLancamento = Omit<Compra, "id" | "forma" | "apagadoEm">;

/**
 * A compra que se manda salvar: sem id, é nova; com id, corrige a que já
 * existe. A tag vem como a pessoa digitou; o domínio a normaliza.
 */
export type LancamentoASalvar = Omit<NovoLancamento, "tag"> & { id?: number; tag?: string | null };

/** Uma vigência como a pessoa a preenche: o mês de início vem do comando, e a tag como foi digitada. */
export type VigenciaASalvar = Omit<Vigencia, "desde" | "tag"> & { tag?: string | null };

/** Um recorrente novo: a data da primeira ocorrência dá o mês de início e o dia. */
export type RecorrenteACriar = VigenciaASalvar & { data: Data };

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
  /** Qual parcela ela é, de quantas e de que total; null no à vista e no recorrente. */
  parcela: { numero: number; de: number; total: Centavos } | null;
  /** Desde quando o recorrente cai, e desde quando vale a vigência deste mês; null na compra. */
  recorrente: { desde: Mes; vigenciaDesde: Mes } | null;
};

/** As ocorrências de um lançamento no mês: nenhuma ou uma. */
export function ocorrenciasNoMes(l: Lancamento, mes: Mes): Ocorrencia[] {
  return l.forma === "compra" ? parcelasNoMes(l, mes) : ocorrenciaDoRecorrente(l, mes);
}

/**
 * As ocorrências de uma compra no mês: a parcela n cai n − 1 meses depois do
 * mês da compra, no mesmo dia (limitado ao último dia do mês). O à vista é a
 * parcela 1 de 1.
 */
function parcelasNoMes(l: Compra, mes: Mes): Ocorrencia[] {
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
      recorrente: null,
    },
  ];
}

/**
 * A ocorrência do recorrente no mês, por conta fechada: só compara meses, sem
 * andar por eles, então um mês distante custa o mesmo que o próximo (ADR-0002).
 */
function ocorrenciaDoRecorrente(r: Recorrente, mes: Mes): Ocorrencia[] {
  const v = vigenciaEm(r, mes);
  if (!v) return [];
  return [
    {
      lancamento: r.id,
      data: diaEm(r.dia, mes),
      descricao: v.descricao,
      pote: v.pote,
      tipo: v.tipo,
      tag: v.tag,
      valor: v.valor,
      parcela: null,
      recorrente: { desde: inicioDe(r), vigenciaDesde: v.desde },
    },
  ];
}

/** O mês da primeira ocorrência. */
export const inicioDe = (r: Recorrente): Mes => r.vigencias[0]!.desde;

/** Se o recorrente cai no mês: do mês de início até antes do encerramento. */
export const caiEm = (r: Recorrente, mes: Mes): boolean => mes >= inicioDe(r) && (r.encerradoEm === null || mes < r.encerradoEm);

/** A vigência que vale no mês, a de maior início até ele; undefined quando o recorrente não cai nele. */
export function vigenciaEm(r: Recorrente, mes: Mes): Vigencia | undefined {
  return caiEm(r, mes) ? r.vigencias.findLast((v) => v.desde <= mes) : undefined;
}

/**
 * As vigências com o último mês em que cada uma vale: o mês antes da próxima,
 * ou antes do encerramento; null é sem fim.
 */
export function vigenciasComFim(r: Recorrente): (Vigencia & { ate: Mes | null })[] {
  return r.vigencias.map((v, i) => {
    const fim = r.vigencias[i + 1]?.desde ?? r.encerradoEm;
    return { ...v, ate: fim === null ? null : somarMeses(fim, -1) };
  });
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
