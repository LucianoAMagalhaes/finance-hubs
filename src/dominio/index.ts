// O módulo de domínio: puro, sem I/O, sem DOM, sem framework. Roda igual no
// servidor e no navegador (ADR-0004). `hoje` sempre entra como parâmetro.
export { aplicar, type Comando, type Resultado } from "./comandos";
export { centavosParaCampo, formatarReais, reaisParaCentavos, type Centavos } from "./dinheiro";
export {
  ehFonte,
  FONTES,
  nomeDaFonte,
  type Entrada,
  type EntradaASalvar,
  type FonteId,
  type NovaEntrada,
} from "./entradas";
export { todosOsGastos, grupos, type Eixo, type Grupo } from "./eixos";
export { antecipacaoEm, compras, estadoVazio, type Estado } from "./estado";
export {
  antecipacoesDe,
  divisaoEmParcelas,
  inicioDe,
  maximoAntecipavel,
  mesDaParcela,
  parcelasAntecipadas,
  somaDasParcelas,
  vigenciaEm,
  vigenciasComFim,
  type Antecipacao,
  type AntecipacaoASalvar,
  type Compra,
  type Corte,
  type Lancamento,
  type LancamentoASalvar,
  type NovoLancamento,
  type Ocorrencia,
  type ParcelasAntecipadas,
  type Recorrente,
  type RecorrenteACriar,
  type Vigencia,
  type VigenciaASalvar,
} from "./lancamentos";
export {
  dataProposta,
  distanciaEntreMeses,
  ehDataValida,
  ehMesValido,
  mesDaData,
  mesmoDiaEm,
  nomeDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type Data,
  type Mes,
} from "./mes";
export {
  ehTipoDeEntrada,
  ehTipoDePagamento,
  nomeDoTipo,
  TIPOS_DE_ENTRADA,
  TIPOS_DE_PAGAMENTO,
  type TipoDeEntrada,
  type TipoDePagamento,
} from "./pagamento";
export { itensNaLixeira, type ItemNaLixeira, type Registro } from "./lixeira";
export {
  ehPote,
  nomeDoPote,
  PERCENTUAIS_PADRAO,
  POTES,
  somaDosPercentuais,
  validarPercentuais,
  type Percentuais,
  type PoteId,
} from "./potes";
export {
  projetarMes,
  type AgregadosDoMes,
  type NaoAlocado,
  type OrcamentoNaVista,
  type PoteNaVista,
  type Veredito,
  type VistaDoMes,
} from "./projecao";
export { fusaoAoRenomear, lancamentosComATag, matizDaTag, normalizarTag, tagsEmUso, tagsNoHistorico } from "./tags";
