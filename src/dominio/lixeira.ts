import type { Entrada } from "./entradas";
import { compras, type Estado } from "./estado";
import type { Antecipacao, Compra, Lancamento } from "./lancamentos";
import type { Data } from "./mes";

/** Os três registros que a pessoa cria, e portanto apaga e restaura. */
export type Registro = "entrada" | "lancamento" | "antecipacao";

export function ehRegistro(registro: unknown): registro is Registro {
  return registro === "entrada" || registro === "lancamento" || registro === "antecipacao";
}

export type ItemNaLixeira = { id: number; apagadoEm: Data } & (
  | { registro: "entrada"; entrada: Entrada }
  | { registro: "lancamento"; lancamento: Lancamento }
  /** A antecipação desfeita, com o parcelado de quem ela é: sozinha, ela não se explica. */
  | { registro: "antecipacao"; antecipacao: Antecipacao; parcelado: Compra }
);

/** Os registros fora da lixeira: só eles geram receita e ocorrência. */
export function vivos<T extends { apagadoEm: Data | null }>(registros: T[]): T[] {
  return registros.filter((r) => r.apagadoEm === null);
}

/**
 * O que está na lixeira, o apagado mais recentemente primeiro; no mesmo dia, o
 * de id maior. Um parcelado na lixeira leva as suas antecipações junto: elas
 * voltam com ele, e não aparecem como itens soltos.
 */
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
    ...compras(estado).flatMap((parcelado) =>
      parcelado.apagadoEm
        ? []
        : parcelado.antecipacoes.flatMap((antecipacao) =>
            antecipacao.apagadoEm
              ? [{ registro: "antecipacao" as const, id: antecipacao.id, apagadoEm: antecipacao.apagadoEm, antecipacao, parcelado }]
              : [],
          ),
    ),
  ];
  return itens.sort((a, b) => (a.apagadoEm === b.apagadoEm ? b.id - a.id : a.apagadoEm < b.apagadoEm ? 1 : -1));
}
