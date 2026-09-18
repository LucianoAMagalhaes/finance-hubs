import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POTES, projetarMes, type Estado, type Percentuais } from "@/dominio";
import { abrirBanco, carregarEstado, gravarEstado, type Banco } from "@/persistencia";

let pasta: string;
let arquivo: string;
const abertos: Banco[] = [];

function abrir(): Banco {
  const banco = abrirBanco(arquivo);
  abertos.push(banco);
  return banco;
}

beforeEach(() => {
  pasta = mkdtempSync(path.join(tmpdir(), "finance-hubs-"));
  arquivo = path.join(pasta, "dados", "finance-hubs.db");
});

afterEach(() => {
  for (const banco of abertos.splice(0)) banco.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

describe("persistência", () => {
  it("um banco novo começa com o estado vazio", () => {
    expect(carregarEstado(abrir())).toEqual({ orcamentos: {} });
  });

  it("um orçamento gravado volta idêntico ao recarregar do banco", () => {
    const estado: Estado = {
      orcamentos: {
        "2026-08": pcts(30, 25, 15, 15, 10, 5),
        "2026-09": pcts(30, 20, 20, 15, 10, 0),
      },
    };
    gravarEstado(abrir(), estado);

    const recarregado = carregarEstado(abrir());

    expect(recarregado).toEqual(estado);
    for (const mes of ["2026-08", "2026-09", "2026-10"] as const) {
      expect(projetarMes(recarregado, mes)).toEqual(projetarMes(estado, mes));
    }
  });

  it("gravar de novo um mês que já existe troca os seus percentuais", () => {
    const banco = abrir();
    gravarEstado(banco, { orcamentos: { "2026-09": pcts(30, 25, 15, 15, 10, 5) } });

    gravarEstado(banco, { orcamentos: { "2026-09": pcts(40, 20, 15, 15, 10, 0) } });

    expect(carregarEstado(abrir()).orcamentos["2026-09"]).toEqual(pcts(40, 20, 15, 15, 10, 0));
  });
});

function pcts(...valores: [number, number, number, number, number, number]): Percentuais {
  return Object.fromEntries(POTES.map((p, i) => [p.id, valores[i]])) as Percentuais;
}
