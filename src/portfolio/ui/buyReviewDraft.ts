import {
  centsToField, decimal, decimalToField, exchangeRateToField,
  type ContributionSuggestion, type IsoDate, type PortfolioCommand, type Result,
} from "@/portfolio/domain";
import type { Ptax } from "@/portfolio/sources";
import { checkTradeDraft, emptyTradeDraft, type TradeDraft, type TradeShape } from "./tradeDraft";

export type BuyReviewLine = Pick<TradeDraft, "quantity" | "unitPrice" | "exchangeRate" | "amount"> & {
  asset: number;
  ticker: string;
  shape: TradeShape;
};
export type BuyReviewDraft = { date: string; unallocated: number; lines: BuyReviewLine[] };

/** The suggestion is copied once. Opening, editing and cancelling never write operations. */
export function openBuyReview(suggestion: ContributionSuggestion, today: IsoDate): BuyReviewDraft {
  return {
    date: today, unallocated: suggestion.unallocated,
    lines: suggestion.classes.flatMap(c => c.assets.filter(a => a.amount > 0 && (a.quantity === null || a.quantity > 0)).map(a => ({
      asset: a.id, ticker: a.ticker, shape: a.bondKind === "private-bond" ? "private-bond" : a.currency,
      quantity: a.quantity === null ? "" : decimalToField(a.quantity),
      unitPrice: a.bondKind === "private-bond" ? "" : decimalToField(decimal(a.price! / 100)),
      exchangeRate: "", amount: a.bondKind === "private-bond" ? centsToField(a.amount) : "",
    }))),
  };
}

/** Reads the existing trade draft interface, keeping any refusal attached to its review line. */
export function readBuyReview(draft: BuyReviewDraft): Result<Extract<PortfolioCommand, { type: "save-buys" }>> {
  if (draft.lines.length === 0) return { ok: false, error: "Mantenha pelo menos uma compra para registrar." };
  const buys: Extract<PortfolioCommand, { type: "save-buys" }>["buys"] = [];
  for (const [index, line] of draft.lines.entries()) {
    const checked = checkTradeDraft({ ...emptyTradeDraft(draft.date as IsoDate, line.asset), ...line, asset: String(line.asset) }, line.shape);
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
