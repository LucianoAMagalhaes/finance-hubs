import { parseDecimal, tradeAmount, type Cents, type IsoDate, type TradeToSave } from "@/portfolio/domain";

/** What is written in each field of the buy's sheet, as the person typed it. */
export type TradeDraft = { asset: string; date: string; quantity: string; unitPrice: string };

/** A new buy: today, and the asset whose row it was opened from, if any. */
export function emptyTradeDraft(today: IsoDate, asset: number | null): TradeDraft {
  return { asset: asset === null ? "" : String(asset), date: today, quantity: "", unitPrice: "" };
}

/**
 * What the sheet sends and shows: the buy as the person wrote it, what the
 * browser already knows it cannot read, and the total, once both numbers read.
 * The rest (positive, date, asset that exists) is the domain's to refuse.
 */
export type CheckedTradeDraft = { trade: TradeToSave; error: string | null; total: Cents | null };

export function checkTradeDraft(draft: TradeDraft): CheckedTradeDraft {
  const quantity = parseDecimal(draft.quantity);
  const unitPrice = parseDecimal(draft.unitPrice);
  const error =
    draft.asset === ""
      ? "Escolha o ativo."
      : quantity === null
        ? "Informe a quantidade, como 100 ou 0,5, com até 8 casas decimais."
        : unitPrice === null
          ? "Informe o preço unitário, como 36,80, com até 8 casas decimais."
          : null;
  return {
    trade: { asset: Number(draft.asset), kind: "buy", date: draft.date as IsoDate, quantity: quantity ?? 0, unitPrice: unitPrice ?? 0 },
    error,
    total: quantity === null || unitPrice === null ? null : tradeAmount(quantity, unitPrice),
  };
}
