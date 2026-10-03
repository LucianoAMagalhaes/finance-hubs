import {
  decimalToField,
  formatDate,
  parseDecimal,
  type Asset,
  type AssetClass,
  type AssetToSave,
  type BondKind,
  type BondType,
  type Indexer,
  type IsoDate,
  type PrivateBond,
  type Bond,
} from "@/portfolio/domain";

/** What is written in each field of the asset's sheet, as the person typed it. The bond's fields are only read in Renda Fixa. */
export type AssetDraft = {
  ticker: string;
  assetClass: AssetClass;
  bondKind: BondKind;
  bondType: BondType;
  indexer: Indexer;
  rate: string;
  maturityDate: string;
  sourceId?: string | null;
};

/** A new asset of the class; in Renda Fixa, a private bond, by default. */
export function emptyAssetDraft(assetClass: AssetClass): AssetDraft {
  return { ticker: "", assetClass, bondKind: "private-bond", bondType: "cdb", indexer: "cdi-percentage", rate: "", maturityDate: "" };
}

/** A saved asset, as the person would have typed it, to be corrected. */
export function assetDraftFrom(asset: Asset): AssetDraft {
  const draft = { ...emptyAssetDraft(asset.assetClass), ticker: asset.ticker };
  const bond = asset.bond;
  if (!bond) return draft;
  if (bond.kind === "treasury-bond") return { ...draft, bondKind: bond.kind, maturityDate: bond.maturityDate, sourceId: asset.sourceId };
  return {
    ...draft,
    bondKind: bond.kind,
    bondType: bond.bondType,
    indexer: bond.indexer,
    rate: decimalToField(bond.rate),
    maturityDate: bond.maturityDate,
  };
}

/** A rate has up to two places: 110, 12,5, 6,15. */
const RATE_PLACES = 2;

/**
 * What the sheet sends: the asset as the person wrote it, with its id when
 * correcting, and what the browser already knows it cannot read. The rest
 * (a name, a positive rate, a unique name) is the domain's to refuse.
 */
export function checkAssetDraft(draft: AssetDraft, id: number | null): { asset: AssetToSave; error: string | null } {
  const common = { ...(id !== null && { id }), ticker: draft.ticker, assetClass: draft.assetClass };
  if (draft.assetClass !== "fixed-income") return { asset: common, error: null };
  if (draft.bondKind === "treasury-bond") return {
    asset: { ...common, sourceId: draft.sourceId, bond: { kind: "treasury-bond", maturityDate: draft.maturityDate as IsoDate } },
    error: draft.sourceId ? null : "Escolha um título do Tesouro Direto.",
  };
  const rate = parseDecimal(draft.rate);
  const readable = rate !== null && rate % 10 ** (8 - RATE_PLACES) === 0;
  const bond: PrivateBond = {
    kind: "private-bond",
    bondType: draft.bondType,
    indexer: draft.indexer,
    rate: readable ? rate : 0,
    maturityDate: draft.maturityDate as IsoDate,
  };
  const error = !readable
    ? "Informe a taxa, como 110 ou 12,5, com até 2 casas decimais."
    : draft.maturityDate === ""
      ? "Informe o vencimento."
      : null;
  return { asset: { ...common, bond }, error };
}

/** What the rate says around its number, by the indexer, and a rate to show as an example. */
export const RATE_AFFIXES: Record<Indexer, { before: string | null; after: string; example: string }> = {
  "cdi-percentage": { before: null, after: "% do CDI", example: "110" },
  "fixed-rate": { before: null, after: "% a.a.", example: "12,5" },
  "ipca-plus": { before: "IPCA +", after: "%", example: "6,15" },
};

/** How the rate reads beside its indexer: "110% do CDI", "12,5% a.a.", "IPCA + 6,15%". */
export function describeRate({ indexer, rate }: Pick<PrivateBond, "indexer" | "rate">): string {
  const { before, after } = RATE_AFFIXES[indexer];
  return `${before ? `${before} ` : ""}${decimalToField(rate)}${after}`;
}

/** The small line under the bond's name: "110% do CDI · vence 02/01/2028". */
export const describeBond = (bond: Bond) => `${bond.kind === "treasury-bond" ? "Tesouro" : describeRate(bond)} · vence ${formatDate(bond.maturityDate)}`;
