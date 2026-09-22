import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import SQLite from "better-sqlite3";
import { openDatabase, type Database } from "@/persistence";

export type Configuracao = {
  arquivoDb: string;
  /** Onde cada inicialização deixa uma cópia do banco. */
  pastaBackup: string;
};

/** `FH_ARQUIVO_DB` e `FH_PASTA_BACKUP`; sem a segunda, as cópias ficam em `backups/` ao lado do banco. */
export function configuracaoDoAmbiente(env: Record<string, string | undefined> = process.env): Configuracao {
  // turbopackIgnore: são caminhos de dados em tempo de execução, não arquivos do app para empacotar.
  const arquivoDb = path.resolve(/*turbopackIgnore: true*/ env.FH_ARQUIVO_DB ?? path.join("dados", "finance-hubs.db"));
  const pastaBackup = path.resolve(
    /*turbopackIgnore: true*/ env.FH_PASTA_BACKUP ?? path.join(path.dirname(arquivoDb), "backups"),
  );
  return { arquivoDb, pastaBackup };
}

/**
 * Sobe a persistência do app: copia o banco que já existe para a pasta de
 * backup, depois abre (criando se preciso) e aplica as migrations. A cópia vem
 * antes das migrations para guardar o banco como ele estava.
 */
export function inicializar(config: Configuracao, agora: Date = new Date()): Database {
  if (existsSync(config.arquivoDb)) copiarBanco(config, agora);
  return openDatabase(config.arquivoDb);
}

function copiarBanco({ arquivoDb, pastaBackup }: Configuracao, agora: Date): void {
  mkdirSync(pastaBackup, { recursive: true });
  const nome = `${path.basename(arquivoDb, path.extname(arquivoDb))}-${carimbo(agora)}.db`;
  const origem = new SQLite(arquivoDb, { readonly: true });
  try {
    // VACUUM INTO dá uma cópia consistente, inclusive do que ainda estiver no WAL.
    origem.prepare("VACUUM INTO ?").run(path.join(pastaBackup, nome));
  } finally {
    origem.close();
  }
}

/** "2026-09-18_07-05-09", no horário local. */
function carimbo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
