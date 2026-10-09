import {
  centsToField, decimal, decimalToField, exchangeRateToField,
  type ContributionAsset, type ContributionSuggestion, type Decimal, type IsoDate, type PortfolioCommand, type Result,
} from "@/portfolio/domain";
import type { Ptax } from "@/portfolio/sources";
import { checkTradeDraft, emptyTradeDraft, type TradeDraft, type TradeShape } from "./tradeDraft";

export type BuyReviewLine = Pick<TradeDraft, "quantity" | "unitPrice" | "exchangeRate" | "amount"> & {
  asset: number;
  ticker: string;
  shape: TradeShape;
};
export type BuyReviewDraft = {
  date: string;
  contribution: number;
  fixedIncome: {
    budget: number;
    assetIds: number[];
    options: TreasuryReviewOption[];
  };
  lines: BuyReviewLine[];
};
export type TreasuryReviewOption = Pick<ContributionAsset, "id" | "ticker" | "price"> & {
  quantity: Decimal;
  amount: number;
  belowMinimum: boolean;
};

const UNIT_SCALE = BigInt(decimal(1));
const CENTS_DENOMINATOR = UNIT_SCALE * UNIT_SCALE * 10000n;

/** Reserve whole cents, as the suggestion does, so a purchase always fits its budget. */
function purchaseCents(quantity: Decimal, unitPrice: Decimal, rate = 10000): number {
  const numerator = BigInt(quantity) * BigInt(unitPrice) * 100n * BigInt(rate);
  return Number((numerator + CENTS_DENOMINATOR - 1n) / CENTS_DENOMINATOR);
}

/** The suggestion is copied once. Opening, editing and cancelling never write operations. */
export function openBuyReview(suggestion: ContributionSuggestion, today: IsoDate): BuyReviewDraft {
  const fixedIncome = suggestion.classes.find(c => c.key === "fixed-income");
  const budget = fixedIncome ? fixedIncome.amount + fixedIncome.unallocated : 0;
  const options = budget > 0 ? fixedIncome!.assets.filter(a => a.bondKind === "treasury-bond" && a.exclusions.length === 0).map(a => {
    const unitPrice = decimal(a.price! / 100);
    const step = decimal(0.01);
    const units = BigInt(budget) * UNIT_SCALE * UNIT_SCALE / (BigInt(unitPrice) * BigInt(step) * 100n);
    const capacity = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / step));
    const quantity = Number(units < capacity ? units : capacity) * step;
    return { id: a.id, ticker: a.ticker, price: a.price, quantity, amount: purchaseCents(quantity, unitPrice),
      belowMinimum: a.quantity === 0 && a.shortfall > 0 && !a.quantityLimited };
  }) : [];
  return {
    date: today, contribution: suggestion.contribution,
    fixedIncome: { budget, assetIds: fixedIncome?.assets.map(a => a.id) ?? [], options },
    lines: suggestion.classes.flatMap(c => c.assets.filter(a => a.amount > 0 && (a.quantity === null || a.quantity > 0)).map(a => ({
      asset: a.id, ticker: a.ticker, shape: a.bondKind === "private-bond" ? "private-bond" : a.currency,
      quantity: a.quantity === null ? "" : decimalToField(a.quantity),
      unitPrice: a.bondKind === "private-bond" ? "" : decimalToField(decimal(a.price! / 100)),
      exchangeRate: "", amount: a.bondKind === "private-bond" ? centsToField(a.amount) : "",
    }))),
  };
}

function checkBuyReviewLine(line: BuyReviewLine, date: string) {
  return checkTradeDraft({ ...emptyTradeDraft(date as IsoDate, line.asset), ...line, asset: String(line.asset) }, line.shape);
}

/** Reads the existing trade draft interface, keeping any refusal attached to its review line. */
export function readBuyReview(draft: BuyReviewDraft): Result<Extract<PortfolioCommand, { type: "save-buys" }>> {
  if (draft.lines.length === 0) return { ok: false, error: "Mantenha pelo menos uma compra para registrar." };
  const buys: Extract<PortfolioCommand, { type: "save-buys" }>["buys"] = [];
  for (const [index, line] of draft.lines.entries()) {
    const checked = checkBuyReviewLine(line, draft.date);
    if (checked.error) return { ok: false, error: `Linha ${index + 1} (${line.ticker}): ${checked.error}` };
    const { id, kind, date, ...buy } = checked.trade;
    buys.push(buy);
  }
  return { ok: true, value: { type: "save-buys", date: draft.date as IsoDate, buys } };
}

/** Only the existing line's editable fields change; no allocation is recalculated. */
export function editBuyReview(draft: BuyReviewDraft, asset: number, change: Partial<Pick<BuyReviewLine, "quantity" | "unitPrice" | "exchangeRate" | "amount">>): BuyReviewDraft {
  return { ...draft, lines: draft.lines.map(line => line.asset === asset ? { ...line, ...change } : line) };
}

export function removeBuyReviewLine(draft: BuyReviewDraft, asset: number): BuyReviewDraft {
  return { ...draft, lines: draft.lines.filter(line => line.asset !== asset) };
}

/** A new operation date asks for its own PTAX and leaves every other edited field intact. */
export function changeBuyReviewDate(draft: BuyReviewDraft, date: string): BuyReviewDraft {
  if (draft.date === date) return draft;
  return { ...draft, date, lines: draft.lines.map(line => line.shape === "USD" ? { ...line, exchangeRate: "" } : line) };
}

/** Ignore late answers for another date and keep a rate already typed while the request was pending. */
export function fillBuyReviewPtax(draft: BuyReviewDraft, date: string, ptax: Ptax | null): BuyReviewDraft {
  if (draft.date !== date || ptax === null) return draft;
  return { ...draft, lines: draft.lines.map(line => line.shape === "USD" && line.exchangeRate === "" ? { ...line, exchangeRate: exchangeRateToField(ptax.rate) } : line) };
}

/** An explicit choice replaces only fixed income; leftover cents never buy another asset. */
export function chooseBuyReviewTreasury(draft: BuyReviewDraft, asset: number): BuyReviewDraft {
  const option = draft.fixedIncome.options.find(a => a.id === asset);
  if (!option || option.quantity === 0) return draft;
  return { ...draft, lines: [
    ...draft.lines.filter(line => !draft.fixedIncome.assetIds.includes(line.asset)),
    { asset: option.id, ticker: option.ticker, shape: "BRL", quantity: decimalToField(option.quantity),
      unitPrice: decimalToField(decimal(option.price! / 100)), exchangeRate: "", amount: "" },
  ] };
}

/** Missing or unreadable fields leave totals pending instead of showing misleading leftovers. */
export function buyReviewTotals(draft: BuyReviewDraft): { total: number; unallocated: number; excess: number } | null {
  let total = 0;
  for (const line of draft.lines) {
    const checked = checkBuyReviewLine(line, draft.date);
    if (checked.error) return null;
    const trade = checked.trade;
    total += "amount" in trade ? trade.amount : purchaseCents(trade.quantity, trade.unitPrice, trade.exchangeRate ?? 10000);
  }
  return { total, unallocated: Math.max(0, draft.contribution - total), excess: Math.max(0, total - draft.contribution) };
}
