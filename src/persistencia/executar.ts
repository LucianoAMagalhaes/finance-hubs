import { aplicar, type Comando, type Data, type Estado } from "@/dominio";
import type { Banco } from "./banco";
import { carregar, gravar } from "./repositorio";

/** A recusa diz qual comando da sequência o domínio recusou, com o texto dele intacto. */
export type ResultadoNoBanco = { ok: true; valor: Estado } | { ok: false; erro: string; indice: number };

/**
 * A porta de escrita do banco: carrega o estado, aplica os comandos em ordem e
 * grava, numa transação só. Se o domínio recusa um comando, nada é gravado —
 * nem os que vieram antes dele.
 */
export function executarNoBanco({ db }: Banco, comandos: Comando[], hoje: Data): ResultadoNoBanco {
  return db.transaction((tx) => {
    let estado = carregar(tx);
    for (const [indice, comando] of comandos.entries()) {
      const resultado = aplicar(estado, comando, hoje);
      if (!resultado.ok) return { ...resultado, indice };
      estado = resultado.valor;
    }
    gravar(tx, estado);
    return { ok: true, valor: estado };
  });
}
