// A lista fixa de sete tipos de pagamento (CONTEXT.md). A ordem é a da tela.
export const TIPOS_DE_PAGAMENTO = [
  { id: "dinheiro", nome: "Dinheiro" },
  { id: "cartao-de-credito", nome: "Cartão de Crédito" },
  { id: "cartao-de-debito", nome: "Cartão de Débito" },
  { id: "pix", nome: "PIX" },
  { id: "transferencia", nome: "Transferência" },
  { id: "boleto", nome: "Boleto" },
  { id: "debito-automatico", nome: "Débito Automático" },
] as const;

export type TipoDePagamento = (typeof TIPOS_DE_PAGAMENTO)[number]["id"];

/** Os três tipos que creditam: os únicos que uma entrada aceita. */
const IDS_DE_ENTRADA = ["dinheiro", "pix", "transferencia"] as const satisfies readonly TipoDePagamento[];

export type TipoDeEntrada = (typeof IDS_DE_ENTRADA)[number];

export function ehTipoDeEntrada(id: unknown): id is TipoDeEntrada {
  return (IDS_DE_ENTRADA as readonly unknown[]).includes(id);
}

export const TIPOS_DE_ENTRADA = TIPOS_DE_PAGAMENTO.filter((t) => ehTipoDeEntrada(t.id));

export function nomeDoTipo(id: TipoDePagamento): string {
  return TIPOS_DE_PAGAMENTO.find((t) => t.id === id)!.nome;
}
