import {
  decimalToField,
  parseDecimal,
  tradeAmount,
  type Cents,
  type IsoDate,
  type Trade,
  type TradeKind,
  type TradeToSave,
} from "@/portfolio/domain";

/** What is written in each field of the trade's sheet, as the person typed it; `id` is the trade being corrected. */
export type TradeDraft = { id: number | null; asset: string; kind: TradeKind; date: string; quantity: string; unitPrice: string };

/** A new buy: today, and the asset whose row it was opened from, if any. */
export function emptyTradeDraft(today: IsoDate, asset: number | null): TradeDraft {
  return { id: null, asset: asset === null ? "" : String(asset), kind: "buy", date: today, quantity: "", unitPrice: "" };
}

/** A saved trade, as the person would have typed it, to be corrected. */
export function tradeDraftFrom(t: Trade): TradeDraft {
  return {
    id: t.id,
    asset: String(t.asset),
    kind: t.kind,
    date: t.date,
    quantity: decimalToField(t.quantity),
    unitPrice: decimalToField(t.unitPrice),
  };
}

/**
 * What the sheet sends and shows: the trade as the person wrote it, what the
 * browser already knows it cannot read, and the total, once both numbers read.
 * The rest (positive, date, asset that exists, enough to sell) is the domain's to refuse.
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
  const trade: TradeToSave = {
    asset: Number(draft.asset),
    kind: draft.kind,
    date: draft.date as IsoDate,
    quantity: quantity ?? 0,
    unitPrice: unitPrice ?? 0,
  };
  return {
    trade: draft.id === null ? trade : { id: draft.id, ...trade },
    error,
    total: quantity === null || unitPrice === null ? null : tradeAmount(quantity, unitPrice),
  };
}
