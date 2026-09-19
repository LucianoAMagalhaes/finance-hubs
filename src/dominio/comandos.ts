import { ehFonte, type EntradaASalvar } from "./entradas";
import type { Estado } from "./estado";
import type { LancamentoASalvar } from "./lancamentos";
import { ehDataValida, ehMesValido, mesDaData, type Data, type Mes } from "./mes";
import { ehTipoDeEntrada, ehTipoDePagamento } from "./pagamento";
import { ehPote, validarPercentuais, type Percentuais } from "./potes";
import { herdaria } from "./projecao";
import { normalizarTag } from "./tags";

/**
 * Tudo que a pessoa pode mandar fazer. Cada comando chega com o ticket que o usa.
 */
export type Comando =
  | { tipo: "salvar-entrada"; entrada: EntradaASalvar }
  | { tipo: "salvar-lancamento"; lancamento: LancamentoASalvar }
  | { tipo: "salvar-percentuais"; mes: Mes; percentuais: Percentuais };

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/**
 * Aplica um comando e devolve o estado novo ou o erro de validação. Puro:
 * nunca muda o estado recebido, e `hoje` entra de fora para o domínio não ler o relógio.
 */
export function aplicar(estado: Estado, comando: Comando, _hoje: Data): Resultado<Estado> {
  switch (comando.tipo) {
    case "salvar-entrada":
      return salvarEntrada(estado, comando.entrada);
    case "salvar-lancamento":
      return salvarLancamento(estado, comando.lancamento);
    case "salvar-percentuais":
      return salvarPercentuais(estado, comando.mes, comando.percentuais);
  }
}

/**
 * Grava os percentuais de um mês, fazendo-o nascer se ainda não tinha nascido.
 * Nenhum outro mês nascido muda; os não nascidos passam a herdar deste pela
 * regra do anterior no tempo mais recente (ADR-0001).
 */
function salvarPercentuais(estado: Estado, mes: Mes, percentuais: Percentuais): Resultado<Estado> {
  if (typeof mes !== "string" || !ehMesValido(mes)) return { ok: false, erro: "Mês inválido." };
  const erro = validarPercentuais(percentuais);
  if (erro) return { ok: false, erro };
  return { ok: true, valor: { ...estado, orcamentos: { ...estado.orcamentos, [mes]: { ...percentuais } } } };
}

function salvarEntrada(estado: Estado, dados: EntradaASalvar): Resultado<Estado> {
  const erro = validarEntrada(dados);
  if (erro) return { ok: false, erro };
  const entradas = gravarNaLista(estado.entradas, { ...dados, descricao: dados.descricao.trim() });
  if (!entradas) return { ok: false, erro: "Essa entrada não existe mais." };
  return { ok: true, valor: nascer({ ...estado, entradas }, mesDaData(dados.data)) };
}

function salvarLancamento(estado: Estado, dados: LancamentoASalvar): Resultado<Estado> {
  const erro = validarLancamento(dados);
  if (erro) return { ok: false, erro };
  const lancamentos = gravarNaLista(estado.lancamentos, {
    ...dados,
    descricao: dados.descricao.trim(),
    tag: dados.tag ? normalizarTag(dados.tag) : null,
  });
  if (!lancamentos) return { ok: false, erro: "Esse lançamento não existe mais." };
  return { ok: true, valor: nascer({ ...estado, lancamentos }, mesDaData(dados.data)) };
}

/**
 * Sem id, acrescenta com o próximo id; com id, troca o registro que o tem.
 * Null quando o id não existe mais.
 */
function gravarNaLista<T extends { id: number }>(lista: T[], { id, ...campos }: Omit<T, "id"> & { id?: number }): T[] | null {
  if (id === undefined) {
    const proximo = Math.max(0, ...lista.map((r) => r.id)) + 1;
    return [...lista, { id: proximo, ...campos } as T];
  }
  if (!lista.some((r) => r.id === id)) return null;
  return lista.map((r) => (r.id === id ? ({ id, ...campos } as T) : r));
}

// O comando chega do navegador: nenhum campo é confiado ao tipo.
function validarEntrada(e: EntradaASalvar): string | null {
  if (typeof e.data !== "string" || !ehDataValida(e.data)) return "Informe uma data válida.";
  if (typeof e.descricao !== "string" || !e.descricao.trim()) return "Informe uma descrição.";
  if (!ehFonte(e.fonte)) return "Escolha uma fonte.";
  if (!ehTipoDeEntrada(e.tipo)) return "Entrada só aceita Dinheiro, PIX ou Transferência.";
  if (!Number.isInteger(e.valor) || e.valor <= 0) {
    return "Entrada tem valor positivo. Dinheiro de volta de um lançamento é reembolso, no pote de origem.";
  }
  return null;
}

function validarLancamento(l: LancamentoASalvar): string | null {
  if (typeof l.data !== "string" || !ehDataValida(l.data)) return "Informe uma data válida.";
  if (typeof l.descricao !== "string" || !l.descricao.trim()) return "Informe uma descrição.";
  if (!ehPote(l.pote)) return "Escolha um dos seis potes.";
  if (!ehTipoDePagamento(l.tipo)) return "Escolha um tipo de pagamento.";
  if (!Number.isInteger(l.valor) || l.valor === 0) return "Informe um valor diferente de zero, em centavos inteiros.";
  if (l.tag !== undefined && l.tag !== null && typeof l.tag !== "string") return "A tag é um texto livre.";
  // Por enquanto só existe o à vista; o parcelado chega no seu próprio ticket.
  if (l.parcelas !== 1) return "Só o à vista pode ser lançado por enquanto.";
  return null;
}

/**
 * O mês nasce no primeiro registro com data nele (ADR-0001): ganha os
 * percentuais que herdaria. Um mês que já nasceu fica como está.
 */
function nascer(estado: Estado, mes: Mes): Estado {
  if (estado.orcamentos[mes]) return estado;
  return { ...estado, orcamentos: { ...estado.orcamentos, [mes]: { ...herdaria(estado, mes).percentuais } } };
}
