import { ehFonte, type EntradaASalvar } from "./entradas";
import { antecipacaoEm, compras, type Estado } from "./estado";
import {
  antecipacoesDe,
  caiEm,
  inicioDe,
  maximoAntecipavel,
  type Antecipacao,
  type AntecipacaoASalvar,
  type Compra,
  type Lancamento,
  type LancamentoASalvar,
  type Recorrente,
  type RecorrenteACriar,
  type Vigencia,
  type VigenciaASalvar,
} from "./lancamentos";
import { ehRegistro, vivos, type Registro } from "./lixeira";
import { ehDataValida, ehMesValido, mesDaData, nomeDoMes, type Data, type Mes } from "./mes";
import { ehTipoDeEntrada, ehTipoDePagamento, type TipoDePagamento } from "./pagamento";
import { ehPote, validarPercentuais, type Percentuais } from "./potes";
import { herdaria } from "./projecao";
import { fusaoAoRenomear, normalizarTag, tagsEmUso, tagsNoHistorico } from "./tags";

/**
 * Tudo que a pessoa pode mandar fazer. Cada comando chega com o ticket que o usa.
 */
export type Comando =
  | { tipo: "salvar-entrada"; entrada: EntradaASalvar }
  | { tipo: "salvar-lancamento"; lancamento: LancamentoASalvar }
  | { tipo: "salvar-antecipacao"; antecipacao: AntecipacaoASalvar }
  | { tipo: "criar-recorrente"; recorrente: RecorrenteACriar }
  | { tipo: "mudar-recorrente"; id: number; mes: Mes; vigencia: VigenciaASalvar }
  | { tipo: "encerrar-recorrente"; id: number; mes: Mes }
  | { tipo: "salvar-percentuais"; mes: Mes; percentuais: Percentuais }
  /** Troca o nome de uma tag no histórico todo; `fundir` confirma juntá-la a uma que já existe. */
  | { tipo: "renomear-tag"; de: string; para: string; fundir: boolean }
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
    case "salvar-antecipacao":
      return salvarAntecipacao(estado, comando.antecipacao);
    case "criar-recorrente":
      return criarRecorrente(estado, comando.recorrente);
    case "mudar-recorrente":
      return mudarRecorrente(estado, comando.id, comando.mes, comando.vigencia);
    case "encerrar-recorrente":
      return encerrarRecorrente(estado, comando.id, comando.mes, hoje);
    case "salvar-percentuais":
      return salvarPercentuais(estado, comando.mes, comando.percentuais);
    case "renomear-tag":
      return renomearTag(estado, comando.de, comando.para, comando.fundir);
    case "apagar":
      return marcarLixeira(estado, comando.registro, comando.id, hoje);
    case "restaurar":
      return marcarLixeira(estado, comando.registro, comando.id, null);
  }
}

/** As três formas que um lançamento pode ter na tela: a compra se divide em à vista e parcelado. */
export type Forma = "a-vista" | "parcelado" | "recorrente";

/**
 * O que um lançamento salvo ainda pode virar no mês aberto, dito antes de a
 * pessoa tentar: cada motivo é a mesma recusa que `aplicar` daria. `formas`
 * diz por que cada forma não pode ser escolhida (null quando pode); `trava`,
 * por que data, total e parcelas não mudam; `encerrar`, o que encerrar o
 * recorrente neste mês faria. Sem lançamento, é um novo: tudo livre.
 */
export type OQuePodeVirar = {
  formas: Record<Forma, string | null>;
  trava: string | null;
  encerrar: Encerramento | null;
};

const LIVRE: OQuePodeVirar = { formas: { "a-vista": null, parcelado: null, recorrente: null }, trava: null, encerrar: null };

export function oQuePodeVirar(lancamento: Lancamento | null, mes: Mes): OQuePodeVirar {
  if (lancamento?.forma === "recorrente") {
    return {
      ...LIVRE,
      formas: { "a-vista": RECORRENTE_NAO_VIRA_COMPRA, parcelado: RECORRENTE_NAO_VIRA_COMPRA, recorrente: null },
      encerrar: encerramento(lancamento, mes),
    };
  }
  if (lancamento?.forma === "compra") {
    const trava = travada(lancamento) ? TRAVA_DA_ANTECIPACAO : null;
    // Só parcelado tem antecipação, e voltar a ser à vista mudaria as parcelas: a trava o prende na forma.
    return { formas: { "a-vista": trava, parcelado: null, recorrente: COMPRA_NAO_VIRA_RECORRENTE }, trava, encerrar: null };
  }
  return LIVRE;
}

const RECORRENTE_NAO_VIRA_COMPRA = "Um recorrente não vira compra: apague e lance de novo.";
const COMPRA_NAO_VIRA_RECORRENTE = "Uma compra não vira recorrente: apague e lance de novo.";

/**
 * Troca a marca de lixeira: apagar a põe com o dia de hoje; restaurar (null) a
 * tira, e o registro volta intacto. Nenhum dos dois faz mês nascer nem mexe em
 * orçamento: apagar a última coisa de um mês deixa os percentuais gravados.
 */
function marcarLixeira(estado: Estado, registro: Registro, id: number, apagadoEm: Data | null): Resultado<Estado> {
  // O comando chega do navegador: nenhum campo é confiado ao tipo.
  if (!ehRegistro(registro)) return { ok: false, erro: "Só entrada, lançamento ou antecipação vão para a lixeira." };
  if (registro === "antecipacao") return marcarAntecipacao(estado, id, apagadoEm);
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

/**
 * Troca o nome de uma tag no histórico todo: nas compras e em todas as
 * vigências, em todos os meses, inclusive no que está na lixeira — senão
 * restaurar ressuscitaria o nome antigo. Quando o nome novo já é de outra tag
 * em uso, as duas viram uma só, e essa fusão exige confirmação explícita:
 * depois dela nada diz quais ocorrências vieram de qual nome. Não faz mês
 * nascer: a tag não é de mês nenhum.
 */
function renomearTag(estado: Estado, de: string, para: string, fundir: boolean): Resultado<Estado> {
  // O comando chega do navegador: nenhum campo é confiado ao tipo.
  if (typeof de !== "string" || typeof para !== "string") return { ok: false, erro: "A tag é um texto livre." };
  const antiga = normalizarTag(de);
  const nova = normalizarTag(para);
  if (nova === null) return { ok: false, erro: "Informe o nome novo da tag." };
  // Uma tag existe enquanto algum lançamento vivo a usa: a que só restou na
  // lixeira não se renomeia, e não é com ela que um nome novo funde.
  const emUso = tagsEmUso(estado);
  if (antiga === null || !emUso.includes(antiga)) return { ok: false, erro: "Essa tag não é de nenhum gasto." };
  if (nova === antiga) return { ok: false, erro: `#${antiga} já é o nome desta tag.` };
  const fusao = fusaoAoRenomear(tagsNoHistorico(estado), antiga, nova);
  if (fusao !== null && fundir !== true) {
    return { ok: false, erro: `Já existe a tag #${fusao}: confirme a fusão para juntar as duas numa só.` };
  }
  const trocar = <T extends { tag: string | null }>(r: T): T => (r.tag === antiga ? { ...r, tag: nova } : r);
  const lancamentos = estado.lancamentos.map((l) => (l.forma === "compra" ? trocar(l) : { ...l, vigencias: l.vigencias.map(trocar) }));
  return { ok: true, valor: { ...estado, lancamentos } };
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
  const anterior = estado.lancamentos.find((l) => l.id === dados.id);
  if (anterior?.forma === "recorrente") return { ok: false, erro: RECORRENTE_NAO_VIRA_COMPRA };
  const travado = travaDaAntecipacao(anterior, dados);
  if (travado) return { ok: false, erro: travado };
  const lancamentos = gravarNaLista<Compra>(estado.lancamentos as Compra[], {
    ...dados,
    forma: "compra",
    descricao: dados.descricao.trim(),
    tag: normalizarTagDigitada(dados.tag),
    // As antecipações são da compra e ficam onde estão: este comando não as toca.
    antecipacoes: anterior?.antecipacoes ?? [],
  });
  if (!lancamentos) return { ok: false, erro: "Esse lançamento não existe mais." };
  return { ok: true, valor: nascer({ ...estado, lancamentos }, mesDaData(dados.data)) };
}

/**
 * Enquanto houver antecipação ativa, data, total e número de parcelas — e com
 * ele a forma — ficam travados (ADR-0005): corrigi-los exige desfazer a
 * antecipação antes. Descrição, pote, tipo e tag continuam editáveis, e a
 * ocorrência da antecipação os acompanha.
 */
function travaDaAntecipacao(anterior: Compra | undefined, dados: LancamentoASalvar): string | null {
  if (!anterior || !travada(anterior)) return null;
  const mudou = anterior.data !== dados.data || anterior.valor !== dados.valor || anterior.parcelas !== dados.parcelas;
  return mudou ? TRAVA_DA_ANTECIPACAO : null;
}

/**
 * Trava a antecipação fora da lixeira: desfeita, ela solta o parcelado. Um
 * parcelado na lixeira não se corrige de jeito nenhum, e essa recusa é de quem grava.
 */
const travada = (compra: Compra) => compra.apagadoEm === null && vivos(compra.antecipacoes).length > 0;

const TRAVA_DA_ANTECIPACAO =
  "Este parcelado tem antecipação: desfaça-a antes de mudar a data, o total ou o número de parcelas.";

/** Sem id, acrescenta uma antecipação; com id, corrige a que já existe. */
function salvarAntecipacao(estado: Estado, dados: AntecipacaoASalvar): Resultado<Estado> {
  if (typeof dados.data !== "string" || !ehDataValida(dados.data)) return { ok: false, erro: "Informe uma data válida." };
  if (!Number.isInteger(dados.valor) || dados.valor <= 0) {
    return { ok: false, erro: "A antecipação tem valor pago positivo, em centavos inteiros: é o que saiu, já com o desconto." };
  }
  if (!Number.isInteger(dados.parcelas) || dados.parcelas < 1) {
    return { ok: false, erro: "Informe quantas parcelas antecipar, um inteiro de 1 em diante." };
  }
  const alvo = parceladoQueAntecipa(estado, dados.lancamento);
  if (!alvo.ok) return alvo;
  const parcelado = alvo.valor;
  if (dados.id !== undefined && !vivos(parcelado.antecipacoes).some((a) => a.id === dados.id)) {
    return { ok: false, erro: "Essa antecipação não existe mais." };
  }
  const id = dados.id ?? proximoId(compras(estado).flatMap((c) => c.antecipacoes));
  const antecipacao: Antecipacao = { id, data: dados.data, parcelas: dados.parcelas, valor: dados.valor, apagadoEm: null };
  // Em ordem de id, que é como o banco as devolve: corrigir uma não muda o lugar dela.
  const antecipacoes = [...parcelado.antecipacoes.filter((a) => a.id !== id), antecipacao].sort((a, b) => a.id - b.id);
  return comAntecipacoes(estado, parcelado, antecipacoes, mesDaData(dados.data));
}

/**
 * Desfazer manda a antecipação para a lixeira, e as parcelas voltam aos seus
 * meses. Restaurar revalida contra o parcelado como ele está e recusa se as
 * parcelas não couberem mais (ADR-0005). Nenhum dos dois faz mês nascer.
 */
function marcarAntecipacao(estado: Estado, id: number, apagadoEm: Data | null): Resultado<Estado> {
  const achada = antecipacaoEm(estado, id);
  if (!achada) return { ok: false, erro: "Essa antecipação não existe mais." };
  const { parcelado, antecipacao: alvo } = achada;
  if (apagadoEm !== null && alvo.apagadoEm !== null) return { ok: false, erro: "Essa antecipação já está na lixeira." };
  if (apagadoEm === null && alvo.apagadoEm === null) return { ok: false, erro: "Essa antecipação não está na lixeira." };
  if (apagadoEm === null && parcelado.apagadoEm !== null) {
    return { ok: false, erro: "O parcelado desta antecipação está na lixeira: restaure-o antes." };
  }
  const antecipacoes = parcelado.antecipacoes.map((a) => (a.id === id ? { ...a, apagadoEm } : a));
  return comAntecipacoes(estado, parcelado, antecipacoes, null);
}

/**
 * Troca as antecipações de um parcelado, recusando a que não couber na série.
 * `mes` é o que nasce; null quando nenhum nasce.
 */
function comAntecipacoes(estado: Estado, parcelado: Compra, antecipacoes: Antecipacao[], mes: Mes | null): Resultado<Estado> {
  const novo: Compra = { ...parcelado, antecipacoes };
  const { recusada } = antecipacoesDe(novo);
  if (recusada) return { ok: false, erro: naoCoube(novo, recusada) };
  const lancamentos = estado.lancamentos.map((l) => (l.id === novo.id ? novo : l));
  const trocado = { ...estado, lancamentos };
  return { ok: true, valor: mes === null ? trocado : nascer(trocado, mes) };
}

/** Por que a antecipação não coube, dito com o máximo que ela alcançaria hoje. */
function naoCoube(parcelado: Compra, recusada: Antecipacao): string {
  const mes = nomeDoMes(mesDaData(recusada.data));
  const maximo = maximoAntecipavel(parcelado, { data: recusada.data, id: recusada.id });
  if (maximo === 0) return `Nenhuma parcela deste parcelado cai depois de ${mes}: não há o que antecipar.`;
  const cabem = maximo === 1 ? "1 parcela" : `${maximo} parcelas`;
  return `Em ${mes} este parcelado antecipa no máximo ${cabem}.`;
}

/** O parcelado vivo que recebe a antecipação. */
function parceladoQueAntecipa(estado: Estado, id: number): Resultado<Compra> {
  const l = estado.lancamentos.find((x) => x.id === id);
  if (!l) return { ok: false, erro: "Esse lançamento não existe mais." };
  if (l.forma !== "compra") return { ok: false, erro: "Um recorrente não tem parcelas para antecipar." };
  if (l.apagadoEm !== null) return { ok: false, erro: "Esse gasto está na lixeira: restaure-o antes." };
  if (l.parcelas < 2) return { ok: false, erro: "Um gasto à vista não tem parcelas para antecipar." };
  if (l.valor < 0) return { ok: false, erro: "Um reembolso não se antecipa: o valor pago de uma antecipação é positivo." };
  return { ok: true, valor: l };
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
  if (encerramento(r, mes).tipo === "lixeira") return marcarLixeira(estado, "lancamento", id, hoje);
  const encerrado = { ...r, vigencias: vigenciasQueFicam(r, mes), encerradoEm: mes };
  return { ok: true, valor: nascer(trocarLancamento(estado, encerrado), mes) };
}

/** O que encerrar um recorrente num mês faz: no de início, nada sobra e ele vai para a lixeira. */
export type Encerramento = { tipo: "lixeira" } | { tipo: "encerra"; descartadas: number };

function encerramento(r: Recorrente, mes: Mes): Encerramento {
  if (mes === inicioDe(r)) return { tipo: "lixeira" };
  return { tipo: "encerra", descartadas: r.vigencias.length - vigenciasQueFicam(r, mes).length };
}

/** As vigências de antes do mês de encerramento; as dali em diante somem de vez. */
const vigenciasQueFicam = (r: Recorrente, mes: Mes) => r.vigencias.filter((v) => v.desde < mes);

/** O recorrente vivo que se muda ou encerra, se ele cai no mês. */
function recorrenteNoMes(estado: Estado, id: number, mes: Mes): Resultado<Recorrente> {
  if (typeof mes !== "string" || !ehMesValido(mes)) return { ok: false, erro: "Mês inválido." };
  const l = estado.lancamentos.find((x) => x.id === id);
  if (!l) return { ok: false, erro: "Esse lançamento não existe mais." };
  if (l.forma !== "recorrente") return { ok: false, erro: COMPRA_NAO_VIRA_RECORRENTE };
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
  return l.parcelas > 1 ? porQueNaoParcela(l.tipo) : null;
}

/** Por que o tipo de pagamento não parcela; null no único que parcela. */
export function porQueNaoParcela(tipo: TipoDePagamento): string | null {
  return tipo === "cartao-de-credito" ? null : "Só Cartão de Crédito parcela.";
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
