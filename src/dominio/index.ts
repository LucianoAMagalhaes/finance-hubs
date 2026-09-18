// O módulo de domínio: puro, sem I/O, sem DOM, sem framework. Roda igual no
// servidor e no navegador (ADR-0004). `hoje` sempre entra como parâmetro.
export { aplicar, type Comando, type Resultado } from "./comandos";
export { formatarReais, type Centavos } from "./dinheiro";
export { estadoVazio, type Estado } from "./estado";
export {
  distanciaEntreMeses,
  mesDaData,
  nomeDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type Data,
  type Mes,
} from "./mes";
export { PERCENTUAIS_PADRAO, POTES, type Percentuais, type PoteId } from "./potes";
export {
  projetarMes,
  type AgregadosDoMes,
  type OrcamentoNaVista,
  type PoteNaVista,
  type Veredito,
  type VistaDoMes,
} from "./projecao";
