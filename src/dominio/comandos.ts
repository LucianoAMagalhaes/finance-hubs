import type { Estado } from "./estado";
import type { Data } from "./mes";

/**
 * Tudo que a pessoa pode mandar fazer. Cada comando chega com o ticket que o
 * usa; até lá, a união está vazia e `aplicar` não tem caso nenhum.
 */
export type Comando = never;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/**
 * Aplica um comando e devolve o estado novo ou o erro de validação. Puro:
 * nunca muda o estado recebido, e `hoje` entra de fora para o domínio não ler o relógio.
 */
export function aplicar(_estado: Estado, comando: Comando, _hoje: Data): Resultado<Estado> {
  return comando;
}
