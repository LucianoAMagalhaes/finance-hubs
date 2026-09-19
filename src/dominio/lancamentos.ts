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
  /** Os pagamentos adiantados das últimas parcelas, em qualquer ordem (ADR-0005). */
  antecipacoes: Antecipacao[];
  /** A marca de lixeira: o dia em que foi apagado; null enquanto está vivo. */
  apagadoEm: Data | null;
};

/**
 * O pagamento adiantado das últimas `parcelas` que ainda sobram do parcelado,
 * por `valor`, em geral com desconto (ADR-0005). Não tem pote, tipo nem tag:
 * herda os do parcelado e os acompanha quando mudam.
 */
export type Antecipacao = {
  /** Numerado entre todas as antecipações, de todos os parcelados. */
  id: number;
  /** O dia do pagamento; o mês dele é o que recebe a ocorrência. */
  data: Data;
  /** Quantas parcelas ela leva, da última para trás. */
  parcelas: number;
  /** O valor pago, sempre positivo. */
  valor: Centavos;
  apagadoEm: Data | null;
};

/** A antecipação que se manda salvar: sem id, é nova; com id, corrige a que já existe. */
export type AntecipacaoASalvar = {
  /** O parcelado de quem ela é. */
  lancamento: number;
  id?: number;
  data: Data;
  parcelas: number;
  valor: Centavos;
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
export type NovoLancamento = Omit<Compra, "id" | "forma" | "antecipacoes" | "apagadoEm">;

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
  /** Que parcelas ela antecipou, de quantas e de que total; null quando não é antecipação. */
  antecipacao: { id: number; primeira: number; ultima: number; de: number; total: Centavos } | null;
};

/** As ocorrências de um lançamento no mês: nenhuma, uma, ou a parcela e uma antecipação. */
export function ocorrenciasNoMes(l: Lancamento, mes: Mes): Ocorrencia[] {
  return l.forma === "compra" ? ocorrenciasDaCompra(l, mes) : ocorrenciaDoRecorrente(l, mes);
}

/** A parcela que ainda cai no mês, e a antecipação que foi paga nele. */
function ocorrenciasDaCompra(l: Compra, mes: Mes): Ocorrencia[] {
  const { cortes, ultima } = antecipacoesDe(l);
  return [
    ...parcelaNoMes(l, mes, ultima),
    ...cortes.filter((c) => mesDaData(c.antecipacao.data) === mes).map((c) => ocorrenciaDaAntecipacao(l, c)),
  ];
}

/**
 * A parcela de uma compra no mês: a parcela n cai n − 1 meses depois do mês da
 * compra, no mesmo dia (limitado ao último dia do mês). O à vista é a parcela 1
 * de 1. As parcelas depois de `ultima` foram antecipadas e já não caem.
 */
function parcelaNoMes(l: Compra, mes: Mes, ultima: number): Ocorrencia[] {
  const numero = distanciaEntreMeses(mesDaData(l.data), mes) + 1;
  if (numero < 1 || numero > ultima) return [];
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
      antecipacao: null,
    },
  ];
}

/** O valor pago, no mês da antecipação, com o pote, o tipo e a tag do parcelado. */
function ocorrenciaDaAntecipacao(l: Compra, { antecipacao, primeira, ultima }: Corte): Ocorrencia {
  return {
    lancamento: l.id,
    data: antecipacao.data,
    descricao: l.descricao,
    pote: l.pote,
    tipo: l.tipo,
    tag: l.tag,
    valor: antecipacao.valor,
    parcela: null,
    recorrente: null,
    antecipacao: { id: antecipacao.id, primeira, ultima, de: l.parcelas, total: l.valor },
  };
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
      antecipacao: null,
    },
  ];
}

/** As parcelas que uma antecipação leva: as últimas que ainda sobravam quando ela foi aplicada. */
export type Corte = { antecipacao: Antecipacao; primeira: number; ultima: number };

/**
 * Como as antecipações vivas cortam a série, aplicadas em ordem de data: cada
 * uma leva as últimas N parcelas que ainda sobram, e só as de meses posteriores
 * ao seu (ADR-0005). `ultima` é a última parcela que continua caindo no seu mês,
 * e é 0 quando o parcelado está quitado. `recusada` é a primeira que não coube:
 * os comandos impedem que ela exista, e a derivação a deixa de fora.
 */
export function antecipacoesDe(l: Compra): { cortes: Corte[]; ultima: number; recusada: Antecipacao | null } {
  const mesDaCompra = mesDaData(l.data);
  const cortes: Corte[] = [];
  let ultima = l.parcelas;
  for (const antecipacao of emOrdemDeAplicacao(l.antecipacoes)) {
    // Só se antecipam parcelas de meses posteriores ao da antecipação.
    const primeiraElegivel = Math.max(1, distanciaEntreMeses(mesDaCompra, mesDaData(antecipacao.data)) + 2);
    const disponiveis = ultima - primeiraElegivel + 1;
    if (!Number.isInteger(antecipacao.parcelas) || antecipacao.parcelas < 1 || antecipacao.parcelas > disponiveis) {
      return { cortes, ultima, recusada: antecipacao };
    }
    cortes.push({ antecipacao, primeira: ultima - antecipacao.parcelas + 1, ultima });
    ultima -= antecipacao.parcelas;
  }
  return { cortes, ultima, recusada: null };
}

/** As vivas em ordem de data; no mesmo dia, na ordem em que foram lançadas. */
function emOrdemDeAplicacao(antecipacoes: Antecipacao[]): Antecipacao[] {
  return antecipacoes.filter((a) => a.apagadoEm === null).sort((a, b) => (a.data === b.data ? a.id - b.id : a.data < b.data ? -1 : 1));
}

/**
 * Uma antecipação sendo montada: sem id, é nova, e entra depois de todas as do
 * mesmo dia — é o que um id novo, sempre maior que os que existem, faria.
 */
type AntecipacaoEmProva = { id?: number; data: Data; parcelas: number };

/** As parcelas que uma antecipação leva, e quanto elas somavam nos seus meses. */
export type ParcelasAntecipadas = { primeira: number; ultima: number; soma: Centavos };

/**
 * As parcelas que essa antecipação levaria e quanto elas somam — o que o
 * formulário mostra e propõe como valor pago. Null quando ela não cabe, seja
 * por si, seja porque desarruma as antecipações de datas posteriores.
 */
export function parcelasAntecipadas(l: Compra, prova: AntecipacaoEmProva): ParcelasAntecipadas | null {
  const id = prova.id ?? Number.MAX_SAFE_INTEGER;
  const candidata: Antecipacao = { id, data: prova.data, parcelas: prova.parcelas, valor: 0, apagadoEm: null };
  const antecipacoes = [...l.antecipacoes.filter((a) => a.id !== id), candidata];
  const { cortes, recusada } = antecipacoesDe({ ...l, antecipacoes });
  if (recusada !== null) return null;
  const corte = cortes.find((c) => c.antecipacao.id === id);
  if (!corte) return null;
  const { primeira, ultima } = corte;
  return { primeira, ultima, soma: somaDasParcelas(l, primeira, ultima) };
}

/**
 * Quantas parcelas cabem nessa antecipação — o "até 4" do formulário. Zero
 * quando não sobra nenhuma parcela de mês posterior ao dela.
 */
export function maximoAntecipavel(l: Compra, prova: Omit<AntecipacaoEmProva, "parcelas">): number {
  // Só um parcelado antecipa: o à vista pesa inteiro no mês da própria data.
  if (l.parcelas < 2) return 0;
  for (let parcelas = l.parcelas; parcelas >= 1; parcelas--) {
    if (parcelasAntecipadas(l, { ...prova, parcelas })) return parcelas;
  }
  return 0;
}

/** Em que mês cai a parcela de número `numero`: a 1ª no mês da compra, a n-ésima n − 1 meses depois. */
export const mesDaParcela = (l: Compra, numero: number): Mes => somarMeses(mesDaData(l.data), numero - 1);

/** Quanto somam as parcelas de `primeira` a `ultima`, contando o centavo que sobra na 1ª. */
export function somaDasParcelas(l: Compra, primeira: number, ultima: number): Centavos {
  const divisao = divisaoEmParcelas(l.valor, l.parcelas);
  return (primeira === 1 ? divisao.primeira : divisao.demais) + divisao.demais * (ultima - primeira);
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
