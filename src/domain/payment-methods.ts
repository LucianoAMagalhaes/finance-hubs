// The fixed list of seven payment methods (CONTEXT.md). The order is the screen's.
export const PAYMENT_METHODS = [
  { id: "cash", name: "Dinheiro" },
  { id: "credit-card", name: "Cartão de Crédito" },
  { id: "debit-card", name: "Cartão de Débito" },
  { id: "pix", name: "PIX" },
  { id: "transfer", name: "Transferência" },
  { id: "boleto", name: "Boleto" },
  { id: "direct-debit", name: "Débito Automático" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

export function isPaymentMethod(id: unknown): id is PaymentMethod {
  return PAYMENT_METHODS.some((m) => m.id === id);
}

/** The three methods that credit: the only ones an income accepts. */
const INCOME_METHOD_IDS = ["cash", "pix", "transfer"] as const satisfies readonly PaymentMethod[];

export type IncomeMethod = (typeof INCOME_METHOD_IDS)[number];

export function isIncomeMethod(id: unknown): id is IncomeMethod {
  return (INCOME_METHOD_IDS as readonly unknown[]).includes(id);
}

export const INCOME_METHODS = PAYMENT_METHODS.filter((m) => isIncomeMethod(m.id));

export function paymentMethodName(id: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.id === id)!.name;
}
