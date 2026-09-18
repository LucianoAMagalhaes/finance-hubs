// Persistência: carrega o estado do SQLite e grava o resultado de um comando.
// Só roda no servidor.
export { abrirBanco, type Banco } from "./banco";
export { carregarEstado, gravarEstado } from "./repositorio";
