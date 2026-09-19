import type { Entrada } from "./entradas";
import type { Estado } from "./estado";
import type { Lancamento } from "./lancamentos";
import type { Data } from "./mes";

/** Os dois registros que a pessoa cria, e portanto apaga e restaura. */
export type Registro = "entrada" | "lancamento";

export function ehRegistro(registro: unknown): registro is Registro {
  return registro === "entrada" || registro === "lancamento";
}

export type ItemNaLixeira = { id: number; apagadoEm: Data } & (
  | { registro: "entrada"; entrada: Entrada }
  | { registro: "lancamento"; lancamento: Lancamento }
);

/** Os registros fora da lixeira: só eles geram receita e ocorrência. */
export function vivos<T extends { apagadoEm: Data | null }>(registros: T[]): T[] {
  return registros.filter((r) => r.apagadoEm === null);
}

/** O que está na lixeira, o apagado mais recentemente primeiro; no mesmo dia, o de id maior. */
export function itensNaLixeira(estado: Estado): ItemNaLixeira[] {
  const itens: ItemNaLixeira[] = [
    ...estado.entradas.flatMap((entrada) =>
      entrada.apagadoEm ? [{ registro: "entrada" as const, id: entrada.id, apagadoEm: entrada.apagadoEm, entrada }] : [],
    ),
    ...estado.lancamentos.flatMap((lancamento) =>
      lancamento.apagadoEm
        ? [{ registro: "lancamento" as const, id: lancamento.id, apagadoEm: lancamento.apagadoEm, lancamento }]
        : [],
    ),
  ];
  return itens.sort((a, b) => (a.apagadoEm === b.apagadoEm ? b.id - a.id : a.apagadoEm < b.apagadoEm ? 1 : -1));
}
