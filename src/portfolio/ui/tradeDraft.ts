import {
  centsToField,
  decimalToField,
  exchangeRateToField,
  exchangeRateToNumber,
  parseDecimal,
  parseExchangeRate,
  reaisToCents,
  tradeAmount,
  type Cents,
  type Currency,
  type IsoDate,
  type Trade,
  type TradeKind,
  type TradeToSave,
} from "@/portfolio/domain";

/** What is written in each field of the trade's sheet, as the person typed it; `id` is the trade being corrected. */
export type TradeDraft = {
  id: number | null;
  asset: string;
  kind: TradeKind;
  date: string;
  quantity: string;
  unitPrice: string;
  /** Only read for an asset in dollars. */
  exchangeRate: string;
  /** Only read for a private bond, which takes the amount in reais instead of quantity and price. */
  amount: string;
};

/** How the chosen asset's trade is written: quantity and price in its currency, or a private bond's amount in reais. */
export type TradeShape = Currency | "private-bond";

/** A new buy: today, and the asset whose row it was opened from, if any. */
export function emptyTradeDraft(today: IsoDate, asset: number | null): TradeDraft {
  return {
    id: null,
    asset: asset === null ? "" : String(asset),
    kind: "buy",
    date: today,
    quantity: "",
    unitPrice: "",
    exchangeRate: "",
    amount: "",
  };
}

/** A saved trade, as the person would have typed it, to be corrected. */
export function tradeDraftFrom(t: Trade): TradeDraft {
  const draft = { id: t.id, asset: String(t.asset), kind: t.kind, date: t.date };
  if ("amount" in t) return { ...draft, quantity: "", unitPrice: "", exchangeRate: "", amount: centsToField(t.amount) };
  return {
    ...draft,
    quantity: decimalToField(t.quantity),
    unitPrice: decimalToField(t.unitPrice),
    exchangeRate: t.exchangeRate === null ? "" : exchangeRateToField(t.exchangeRate),
    amount: "",
  };
}

/**
 * What the sheet sends and shows: the trade as the person wrote it, what the
 * browser already knows it cannot read, and the total in the asset's currency,
 * once both numbers read; in dollars, also in reais, once the rate reads. A
 * private bond's total is the amount typed.
 * The rest (positive, date, asset that exists, enough to sell) is the domain's to refuse.
 */
export type CheckedTradeDraft = { trade: TradeToSave; error: string | null; total: Cents | null; totalInReais: Cents | null };

/** `shape` is the chosen asset's: the rate is only read, and sent, in dollars; the amount, in a private bond. */
export function checkTradeDraft(draft: TradeDraft, shape: TradeShape): CheckedTradeDraft {
  const common = { asset: Number(draft.asset), kind: draft.kind, date: draft.date as IsoDate };
  const withId = (trade: TradeToSave): TradeToSave => (draft.id === null ? trade : { id: draft.id, ...trade });
  if (shape === "private-bond") {
    const amount = reaisToCents(draft.amount);
    const error =
      draft.asset === "" ? "Escolha o ativo." : amount === null ? "Informe o valor, como 10.000,00, com até 2 casas decimais." : null;
    return { trade: withId({ ...common, amount: amount ?? 0 }), error, total: amount, totalInReais: null };
  }

  const quantity = parseDecimal(draft.quantity);
  const unitPrice = parseDecimal(draft.unitPrice);
  const rate = shape === "USD" ? parseExchangeRate(draft.exchangeRate) : null;
  const error =
    draft.asset === ""
      ? "Escolha o ativo."
      : quantity === null
        ? "Informe a quantidade, como 100 ou 0,5, com até 8 casas decimais."
        : unitPrice === null
          ? "Informe o preço unitário, como 36,80, com até 8 casas decimais."
          : shape === "USD" && rate === null
            ? "Informe o câmbio, como 5,4213, com até 4 casas decimais."
            : null;
  const total = quantity === null || unitPrice === null ? null : tradeAmount(quantity, unitPrice);
  return {
    trade: withId({ ...common, quantity: quantity ?? 0, unitPrice: unitPrice ?? 0, exchangeRate: rate }),
    error,
    total,
    totalInReais: total === null || rate === null ? null : total * exchangeRateToNumber(rate),
  };
}
