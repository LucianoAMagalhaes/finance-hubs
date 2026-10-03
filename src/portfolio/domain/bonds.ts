import { isValidDate, type IsoDate } from "@/shared";
import type { Decimal } from "./decimal";

/** The two ways of a fixed-income asset: a Tesouro Direto bond, chosen from a list, or a private bond, typed by the person. */
export const BOND_KINDS = ["treasury-bond", "private-bond"] as const;
export type BondKind = (typeof BOND_KINDS)[number];

/** Only informative: the type changes no computation. */
export const BOND_TYPES = ["cdb", "lci", "lca", "debenture"] as const;
export type BondType = (typeof BOND_TYPES)[number];

/** The rule a private bond yields by, with its rate. */
export const INDEXERS = ["cdi-percentage", "fixed-rate", "ipca-plus"] as const;
export type Indexer = (typeof INDEXERS)[number];

/**
 * A CDB, LCI, LCA or debenture, with its name in the asset's ticker. The rate
 * is an exact decimal in percent: 110% of the CDI is 110, 12,5% a year is
 * 12,5, IPCA + 6,15% is 6,15.
 */
export type PrivateBond = { kind: "private-bond"; bondType: BondType; indexer: Indexer; rate: Decimal; maturityDate: IsoDate };

/** A listed Tesouro Direto bond, priced at market and identified in the asset by its source id. */
export type TreasuryBond = { kind: "treasury-bond"; maturityDate: IsoDate };
/** The fixed-income part of an asset. */
export type Bond = PrivateBond | TreasuryBond;

/** Whether the asset is a private bond, whose trades are in reais and whose price is accrued on its curve. */
export const isPrivateBond = (asset: { bond?: Bond | null } | undefined): asset is { bond: PrivateBond } =>
  asset?.bond?.kind === "private-bond";

/**
 * Checks every field of the bond, because the command comes from the browser,
 * and returns the bond as it is kept, or the refusal. `kept` is the bond being
 * corrected, whose way never changes.
 */
export function checkBond(data: Bond, kept: Bond | undefined): { bond: Bond } | { error: string } {
  if (!BOND_KINDS.includes(data?.kind)) return { error: "Escolha Tesouro Direto ou título privado." };
  if (kept && kept.kind !== data.kind) return { error: "O jeito do título não muda depois do cadastro." };
  if (data.kind === "treasury-bond") {
    if (typeof data.maturityDate !== "string" || !isValidDate(data.maturityDate)) return { error: "Informe um vencimento válido." };
    return { bond: { kind: data.kind, maturityDate: data.maturityDate } };
  }
  if (!BOND_TYPES.includes(data.bondType)) return { error: "Escolha o tipo do título." };
  if (!INDEXERS.includes(data.indexer)) return { error: "Escolha o indexador do título." };
  if (!Number.isSafeInteger(data.rate)) return { error: "A taxa aceita até 8 casas decimais." };
  if (data.rate <= 0) return { error: "A taxa tem que ser maior que zero." };
  if (typeof data.maturityDate !== "string" || !isValidDate(data.maturityDate)) return { error: "Informe um vencimento válido." };
  const { kind, bondType, indexer, rate, maturityDate } = data;
  return { bond: { kind, bondType, indexer, rate, maturityDate } };
}
