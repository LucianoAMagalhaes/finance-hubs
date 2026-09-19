import type { Centavos } from "./dinheiro";
import { mesDaData, type Data, type Mes } from "./mes";
import type { TipoDePagamento } from "./pagamento";
import type { PoteId } from "./potes";

/**
 * Um gasto (ADR-0003). É a única coisa gravada: a ocorrência é derivada
 * (ADR-0002). O à vista é uma compra de uma parcela.
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
};

/** O que a pessoa preenche no formulário; o id vem do domínio num lançamento novo. */
export type NovoLancamento = Omit<Lancamento, "id">;

/** O que se manda salvar: sem id, é um lançamento novo; com id, corrige o que já existe. */
export type LancamentoASalvar = NovoLancamento & { id?: number };

/** O impacto de um lançamento num mês. Nunca gravada, sempre derivada. */
export type Ocorrencia = {
  /** O id do lançamento de onde ela vem. */
  lancamento: number;
  data: Data;
  descricao: string;
  pote: PoteId;
  tipo: TipoDePagamento;
  valor: Centavos;
};

/** As ocorrências de um lançamento no mês: a do à vista cai no mês da sua data. */
export function ocorrenciasNoMes(l: Lancamento, mes: Mes): Ocorrencia[] {
  if (mesDaData(l.data) !== mes) return [];
  return [{ lancamento: l.id, data: l.data, descricao: l.descricao, pote: l.pote, tipo: l.tipo, valor: l.valor }];
}
