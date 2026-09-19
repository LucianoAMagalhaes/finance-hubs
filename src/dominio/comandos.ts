import { ehFonte, type EntradaASalvar } from "./entradas";
import type { Estado } from "./estado";
import {
  caiEm,
  inicioDe,
  type Compra,
  type LancamentoASalvar,
  type Recorrente,
  type RecorrenteACriar,
  type Vigencia,
  type VigenciaASalvar,
} from "./lancamentos";
import { ehRegistro, type Registro } from "./lixeira";
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
  | { tipo: "criar-recorrente"; recorrente: RecorrenteACriar }
  | { tipo: "mudar-recorrente"; id: number; mes: Mes; vigencia: VigenciaASalvar }
  | { tipo: "encerrar-recorrente"; id: number; mes: Mes }
  | { tipo: "salvar-percentuais"; mes: Mes; percentuais: Percentuais }
  | { tipo: "apagar"; registro: Registro; id: number }
  | { tipo: "restaurar"; registro: Registro; id: number };

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/**
 * Aplica um comando e devolve o estado novo ou o erro de validação. Puro:
 * nunca muda o estado recebido, e `hoje` entra de fora para o domínio não ler o relógio.
 */
export function aplicar(estado: Estado, comando: Comando, hoje: Data): Resultado<Estado> {
  switch (comando.tipo) {
    case "salvar-entrada":
      return salvarEntrada(estado, comando.entrada);
    case "salvar-lancamento":
      return salvarLancamento(estado, comando.lancamento);
    case "criar-recorrente":
      return criarRecorrente(estado, comando.recorrente);
    case "mudar-recorrente":
      return mudarRecorrente(estado, comando.id, comando.mes, comando.vigencia);
    case "encerrar-recorrente":
      return encerrarRecorrente(estado, comando.id, comando.mes, hoje);
    case "salvar-percentuais":
      return salvarPercentuais(estado, comando.mes, comando.percentuais);
    case "apagar":
      return marcarLixeira(estado, comando.registro, comando.id, hoje);
    case "restaurar":
      return marcarLixeira(estado, comando.registro, comando.id, null);
  }
}

/**
 * Troca a marca de lixeira: apagar a põe com o dia de hoje; restaurar (null) a
 * tira, e o registro volta intacto. Nenhum dos dois faz mês nascer nem mexe em
 * orçamento: apagar a última coisa de um mês deixa os percentuais gravados.
 */
function marcarLixeira(estado: Estado, registro: Registro, id: number, apagadoEm: Data | null): Resultado<Estado> {
  // O comando chega do navegador: nenhum campo é confiado ao tipo.
  if (!ehRegistro(registro)) return { ok: false, erro: "Só entrada ou lançamento vão para a lixeira." };
  const chave = registro === "entrada" ? "entradas" : "lancamentos";
  const lista: { id: number; apagadoEm: Data | null }[] = estado[chave];
  const alvo = lista.find((r) => r.id === id);
  const nome = registro === "entrada" ? "Essa entrada" : "Esse lançamento";
  if (!alvo) return { ok: false, erro: `${nome} não existe mais.` };
  if (apagadoEm !== null && alvo.apagadoEm !== null) return { ok: false, erro: `${nome} já está na lixeira.` };
  if (apagadoEm === null && alvo.apagadoEm === null) return { ok: false, erro: `${nome} não está na lixeira.` };
  return { ok: true, valor: { ...estado, [chave]: lista.map((r) => (r.id === id ? { ...r, apagadoEm } : r)) } };
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
  if (estado.lancamentos.some((l) => l.id === dados.id && l.forma === "recorrente")) {
    return { ok: false, erro: "Um recorrente não vira compra: apague e lance de novo." };
  }
  const lancamentos = gravarNaLista<Compra>(estado.lancamentos as Compra[], {
    ...dados,
    forma: "compra",
    descricao: dados.descricao.trim(),
    tag: normalizarTagDigitada(dados.tag),
  });
  if (!lancamentos) return { ok: false, erro: "Esse lançamento não existe mais." };
  return { ok: true, valor: nascer({ ...estado, lancamentos }, mesDaData(dados.data)) };
}

/** A data da primeira ocorrência dá o mês de início e o dia, que não muda mais. */
function criarRecorrente(estado: Estado, dados: RecorrenteACriar): Resultado<Estado> {
  if (typeof dados.data !== "string" || !ehDataValida(dados.data)) return { ok: false, erro: "Informe uma data válida." };
  const erro = validarCampos(dados);
  if (erro) return { ok: false, erro };
  const inicio = mesDaData(dados.data);
  const recorrente: Recorrente = {
    id: proximoId(estado.lancamentos),
    forma: "recorrente",
    dia: Number(dados.data.slice(8)),
    vigencias: [vigenciaDe(inicio, dados)],
    encerradoEm: null,
    apagadoEm: null,
  };
  return { ok: true, valor: nascer({ ...estado, lancamentos: [...estado.lancamentos, recorrente] }, inicio) };
}

/**
 * Mudar a partir de um mês vale até a próxima mudança: a vigência que começa
 * nele é substituída, ou nasce uma nova; as seguintes ficam intactas.
 */
function mudarRecorrente(estado: Estado, id: number, mes: Mes, dados: VigenciaASalvar): Resultado<Estado> {
  const alvo = recorrenteNoMes(estado, id, mes);
  if (!alvo.ok) return alvo;
  const erro = validarCampos(dados);
  if (erro) return { ok: false, erro };
  const r = alvo.valor;
  const vigencias = [...r.vigencias.filter((v) => v.desde !== mes), vigenciaDe(mes, dados)].sort((a, b) =>
    a.desde < b.desde ? -1 : 1,
  );
  return { ok: true, valor: nascer(trocarLancamento(estado, { ...r, vigencias }), mes) };
}

/**
 * Encerrar num mês faz dele o primeiro sem ocorrência e descarta de vez as
 * vigências dali em diante. No mês de início não sobra nada: o recorrente
 * inteiro vai para a lixeira, de onde volta como estava.
 */
function encerrarRecorrente(estado: Estado, id: number, mes: Mes, hoje: Data): Resultado<Estado> {
  const alvo = recorrenteNoMes(estado, id, mes);
  if (!alvo.ok) return alvo;
  const r = alvo.valor;
  if (mes === inicioDe(r)) return marcarLixeira(estado, "lancamento", id, hoje);
  const encerrado = { ...r, vigencias: r.vigencias.filter((v) => v.desde < mes), encerradoEm: mes };
  return { ok: true, valor: nascer(trocarLancamento(estado, encerrado), mes) };
}

/** O recorrente vivo que se muda ou encerra, se ele cai no mês. */
function recorrenteNoMes(estado: Estado, id: number, mes: Mes): Resultado<Recorrente> {
  if (typeof mes !== "string" || !ehMesValido(mes)) return { ok: false, erro: "Mês inválido." };
  const l = estado.lancamentos.find((x) => x.id === id);
  if (!l) return { ok: false, erro: "Esse lançamento não existe mais." };
  if (l.forma !== "recorrente") return { ok: false, erro: "Uma compra não vira recorrente: apague e lance de novo." };
  if (l.apagadoEm !== null) return { ok: false, erro: "Esse recorrente está na lixeira: restaure-o antes." };
  if (!caiEm(l, mes)) return { ok: false, erro: "Esse recorrente não cai neste mês." };
  return { ok: true, valor: l };
}

function vigenciaDe(desde: Mes, { descricao, pote, tipo, valor, tag }: VigenciaASalvar): Vigencia {
  return { desde, descricao: descricao.trim(), pote, tipo, valor, tag: normalizarTagDigitada(tag) };
}

const normalizarTagDigitada = (tag: string | null | undefined) => (tag ? normalizarTag(tag) : null);

const trocarLancamento = (estado: Estado, novo: Recorrente): Estado => ({
  ...estado,
  lancamentos: estado.lancamentos.map((l) => (l.id === novo.id ? novo : l)),
});

/** O próximo id, contando os da lixeira: um registro novo nunca reaproveita o de outro. */
const proximoId = (lista: { id: number }[]) => Math.max(0, ...lista.map((r) => r.id)) + 1;

/**
 * Sem id, acrescenta com o próximo id, contando os da lixeira; com id, troca o
 * registro que o tem. Null quando o id não existe mais ou está na lixeira:
 * corrigir exige restaurar antes.
 */
function gravarNaLista<T extends { id: number; apagadoEm: Data | null }>(
  lista: T[],
  { id, ...campos }: Omit<T, "id" | "apagadoEm"> & { id?: number },
): T[] | null {
  if (id === undefined) return [...lista, { id: proximoId(lista), ...campos, apagadoEm: null } as T];
  if (!lista.some((r) => r.id === id && r.apagadoEm === null)) return null;
  return lista.map((r) => (r.id === id ? ({ id, ...campos, apagadoEm: null } as T) : r));
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
  const erro = validarCampos(l);
  if (erro) return erro;
  if (!Number.isInteger(l.parcelas) || l.parcelas < 1) return "Informe o número de parcelas, um inteiro de 1 em diante.";
  if (l.parcelas > 1 && l.tipo !== "cartao-de-credito") return "Só Cartão de Crédito parcela.";
  return null;
}

/** O que compra e vigência têm em comum. */
function validarCampos(l: VigenciaASalvar): string | null {
  if (typeof l.descricao !== "string" || !l.descricao.trim()) return "Informe uma descrição.";
  if (!ehPote(l.pote)) return "Escolha um dos seis potes.";
  if (!ehTipoDePagamento(l.tipo)) return "Escolha um tipo de pagamento.";
  if (!Number.isInteger(l.valor) || l.valor === 0) return "Informe um valor diferente de zero, em centavos inteiros.";
  if (l.tag !== undefined && l.tag !== null && typeof l.tag !== "string") return "A tag é um texto livre.";
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
