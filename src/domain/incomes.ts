import type { Cents } from "./money";
import type { IsoDate } from "./month";
import type { IncomeMethod } from "./payment-methods";

// The fixed list of four sources (CONTEXT.md). The order is the screen's.
export const INCOME_SOURCES = [
  { id: "salary", name: "Salário" },
  { id: "freelance", name: "Freela" },
  { id: "investment-returns", name: "Rendimentos" },
  { id: "other-income", name: "Outras Receitas" },
] as const;

export type IncomeSource = (typeof INCOME_SOURCES)[number]["id"];

export function isIncomeSource(id: unknown): id is IncomeSource {
  return INCOME_SOURCES.some((s) => s.id === id);
}

export function incomeSourceName(id: IncomeSource): string {
  return INCOME_SOURCES.find((s) => s.id === id)!.name;
}

/**
 * Money coming in (ADR-0003). Has no jar, has no installments and doesn't repeat:
 * it only impacts the month of its own date.
 */
export type Income = {
  id: number;
  date: IsoDate;
  description: string;
  source: IncomeSource;
  paymentMethod: IncomeMethod;
  /** Always positive. Money coming back from an expense is a refund, not an income. */
  amount: Cents;
  /** The trash mark: the day it was deleted; null while it is live. */
  deletedAt: IsoDate | null;
};

/** What the person fills in on the form; the id comes from the domain for a new income. */
export type NewIncome = Omit<Income, "id" | "deletedAt">;

/** What is sent to be saved: without id, it is a new income; with id, it corrects the existing one. */
export type IncomeToSave = NewIncome & { id?: number };
