// Persistência: carrega o estado do SQLite e executa comandos contra ele.
// Só roda no servidor.
export { abrirBanco, type Banco } from "./banco";
export { executarNoBanco, type ResultadoNoBanco } from "./executar";
export { carregarEstado } from "./repositorio";
