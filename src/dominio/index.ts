// O módulo de domínio: puro, sem I/O, sem DOM, sem framework. Roda igual no
// servidor e no navegador (ADR-0004). `hoje` sempre entra como parâmetro.
export { aplicar, type Comando, type Resultado } from "./comandos";
export { formatarReais, reaisParaCentavos, type Centavos } from "./dinheiro";
export {
  ehFonte,
  FONTES,
  nomeDaFonte,
  type Entrada,
  type EntradaASalvar,
  type FonteId,
  type NovaEntrada,
} from "./entradas";
export { estadoVazio, type Estado } from "./estado";
export {
  dataProposta,
  distanciaEntreMeses,
  ehDataValida,
  mesDaData,
  nomeDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type Data,
  type Mes,
} from "./mes";
export {
  ehTipoDeEntrada,
  nomeDoTipo,
  TIPOS_DE_ENTRADA,
  TIPOS_DE_PAGAMENTO,
  type TipoDeEntrada,
  type TipoDePagamento,
} from "./pagamento";
export { PERCENTUAIS_PADRAO, POTES, type Percentuais, type PoteId } from "./potes";
export {
  projetarMes,
  type AgregadosDoMes,
  type NaoAlocado,
  type OrcamentoNaVista,
  type PoteNaVista,
  type Veredito,
  type VistaDoMes,
} from "./projecao";
