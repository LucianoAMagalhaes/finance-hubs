import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyState, JARS, type Percentages } from "@/domain";
import { abrirBanco, carregarEstado, executarNoBanco } from "@/persistencia";
import { configuracaoDoAmbiente, inicializar } from "./inicializacao";

let pasta: string;

beforeEach(() => {
  pasta = mkdtempSync(path.join(tmpdir(), "finance-hubs-"));
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

const setembro = Object.fromEntries(JARS.map((p) => [p.id, 10])) as Percentages;

describe("inicialização", () => {
  it("cria o banco se não existir e aplica as migrations", () => {
    const arquivoDb = path.join(pasta, "dados", "finance-hubs.db");

    const banco = inicializar({ arquivoDb, pastaBackup: path.join(pasta, "backups") });

    expect(existsSync(arquivoDb)).toBe(true);
    expect(carregarEstado(banco)).toEqual(emptyState());
    banco.fechar();
  });

  it("copia o banco existente para a pasta configurada, com data e hora no nome", () => {
    const arquivoDb = path.join(pasta, "dados", "finance-hubs.db");
    const pastaBackup = path.join(pasta, "copias");
    const anterior = abrirBanco(arquivoDb);
    const preparado = executarNoBanco(anterior, [{ type: "save-percentages", month: "2026-09", percentages: setembro }], "2026-09-18");
    expect(preparado.ok).toBe(true);
    anterior.fechar();

    const banco = inicializar({ arquivoDb, pastaBackup }, new Date(2026, 8, 18, 7, 5, 9));
    banco.fechar();

    expect(readdirSync(pastaBackup)).toEqual(["finance-hubs-2026-09-18_07-05-09.db"]);
    const copia = abrirBanco(path.join(pastaBackup, "finance-hubs-2026-09-18_07-05-09.db"));
    expect(carregarEstado(copia).budgets["2026-09"]).toEqual(setembro);
    copia.fechar();
  });

  it("na primeira inicialização, sem banco ainda, não há o que copiar", () => {
    const pastaBackup = path.join(pasta, "backups");

    inicializar({ arquivoDb: path.join(pasta, "finance-hubs.db"), pastaBackup }).fechar();

    expect(existsSync(pastaBackup) ? readdirSync(pastaBackup) : []).toEqual([]);
  });

  it("sem a variável de ambiente, as cópias vão para uma pasta ao lado do banco", () => {
    expect(configuracaoDoAmbiente({ FH_ARQUIVO_DB: "/srv/fh/dados.db" })).toEqual({
      arquivoDb: "/srv/fh/dados.db",
      pastaBackup: "/srv/fh/backups",
    });
    expect(configuracaoDoAmbiente({ FH_ARQUIVO_DB: "/srv/fh/dados.db", FH_PASTA_BACKUP: "/mnt/nuvem" })).toEqual({
      arquivoDb: "/srv/fh/dados.db",
      pastaBackup: "/mnt/nuvem",
    });
  });
});
