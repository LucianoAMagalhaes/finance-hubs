import { expect, it } from "vitest";
import { apply, decimal, emptyPortfolio, suggestContribution, type PortfolioCommand } from "@/portfolio/domain";
import { openBuyReview, readBuyReview, editBuyReview, removeBuyReviewLine, changeBuyReviewDate, fillBuyReviewPtax } from "./buyReviewDraft";

const TODAY = "2026-09-25";
function suggestion() {
  let state = emptyPortfolio();
  const commands: PortfolioCommand[] = [
    { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
    { type: "save-asset", asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" } },
    { type: "save-asset", asset: { ticker: "CDB", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(10), maturityDate: "2028-01-01" } } },
    { type: "save-targets", targets: { "domestic-stocks": 0, "international-stocks": 40, "fixed-income": 30, "real-estate-funds": 0, crypto: 30 } },
    { type: "save-score", asset: 2, score: 10 },
    { type: "save-score", asset: 3, score: 10 },
    ...state.questionnaires[0]!.questions.map(q => ({ type: "save-answer" as const, asset: 1, question: q.id, value: true })),
    { type: "record-quotes", quotes: [{ asset: 1, price: decimal(100), at: `${TODAY}T12:00:00` }, { asset: 2, price: decimal(300000), at: `${TODAY}T12:00:00` }], exchangeRate: { rate: 50000, at: `${TODAY}T12:00:00` } },
  ];
  for (const command of commands) {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  const result = suggestContribution(state, 100000, TODAY);
  if (!result.ok) throw new Error(result.error);
  return { state, suggestion: result.value };
}

it("opens only suggested purchases with one common date and never copies the current dollar rate", () => {
  const { state, suggestion: value } = suggestion();
  const before = structuredClone(state);
  const draft = openBuyReview(value, TODAY);
  expect(draft.date).toBe(TODAY);
  expect(draft.lines).toHaveLength(3);
  expect(draft.lines.find(l => l.asset === 1)).toMatchObject({ quantity: "0,8", unitPrice: "100", exchangeRate: "" });
  expect(draft.lines.find(l => l.asset === 3)).toMatchObject({ shape: "private-bond", amount: "300,00", quantity: "", unitPrice: "" });
  expect(state).toEqual(before);
  expect(readBuyReview(draft).ok).toBe(false);
});

it("edits and removes lines without redistributing, permits exceeding the contribution and reads private applications in reais", () => {
  const { state, suggestion: value } = suggestion();
  const opened = openBuyReview(value, TODAY);
  const changed = editBuyReview(opened, 3, { amount: "2.000,00" });
  expect(changed.lines.filter(l => l.asset !== 3)).toEqual(opened.lines.filter(l => l.asset !== 3));
  expect(changed.unallocated).toBe(opened.unallocated);
  expect(editBuyReview(changed, 99, { quantity: "1" })).toEqual(changed);
  const removed = removeBuyReviewLine(changed, 1);
  const checked = readBuyReview(removed);
  expect(checked.ok).toBe(true);
  if (!checked.ok) throw new Error(checked.error);
  expect(checked.value.buys).toContainEqual({ asset: 3, amount: 200000 });
  const saved = apply(state, checked.value, TODAY);
  expect(saved.ok).toBe(true);
  expect(state.trades).toEqual([]);
  expect(readBuyReview({ ...removed, lines: [] })).toEqual({ ok: false, error: "Mantenha pelo menos uma compra para registrar." });
});

it("fills historical PTAX without changing units, resets it for the new common date and preserves manual correction on failure", () => {
  const { state, suggestion: value } = suggestion();
  let draft = openBuyReview(value, TODAY);
  draft = fillBuyReviewPtax(draft, TODAY, { date: TODAY, rate: 54000 });
  expect(draft.lines.find(l => l.asset === 1)).toMatchObject({ quantity: "0,8", unitPrice: "100", exchangeRate: "5,4" });
  draft = editBuyReview(draft, 1, { quantity: "1,2", unitPrice: "110" });
  const previous = draft;
  draft = changeBuyReviewDate(draft, "2026-09-24");
  expect(draft.lines.find(l => l.asset === 1)).toMatchObject({ quantity: "1,2", unitPrice: "110", exchangeRate: "" });
  expect(fillBuyReviewPtax(draft, TODAY, { date: TODAY, rate: 54000 })).toEqual(draft);
  draft = fillBuyReviewPtax(draft, "2026-09-24", null);
  expect(readBuyReview(draft).ok).toBe(false);
  draft = editBuyReview(draft, 1, { exchangeRate: "5,3" });
  expect(fillBuyReviewPtax(draft, draft.date, { date: "2026-09-24", rate: 55000 })).toEqual(draft);
  const checked = readBuyReview(draft);
  if (!checked.ok) throw new Error(checked.error);
  expect(checked.value.date).toBe("2026-09-24");
  expect(checked.value.buys).toContainEqual({ asset: 1, quantity: decimal(1.2), unitPrice: decimal(110), exchangeRate: 53000 });
  const saved = apply(state, checked.value, TODAY);
  if (!saved.ok) throw new Error(saved.error);
  expect(saved.value.trades.every(t => t.date === "2026-09-24")).toBe(true);
  expect(previous.date).toBe(TODAY);
  const newDate = changeBuyReviewDate(draft, "2026-09-23");
  expect(fillBuyReviewPtax(newDate, newDate.date, { date: "2026-09-23", rate: 52000 }).lines.find(l => l.asset === 1)?.exchangeRate).toBe("5,2");
});

it("retains edited fields after a refusal and can correct and register ordinary purchases", () => {
  const { state, suggestion: value } = suggestion();
  const draft = editBuyReview(fillBuyReviewPtax(openBuyReview(value, TODAY), TODAY, { date: TODAY, rate: 54000 }), 3, { amount: "0,00" });
  const before = structuredClone(draft);
  const checked = readBuyReview(draft);
  if (!checked.ok) throw new Error(checked.error);
  expect(apply(state, checked.value, TODAY)).toMatchObject({ ok: false, error: expect.stringContaining("CDB") });
  expect(draft).toEqual(before);
  expect(state.trades).toEqual([]);
  const corrected = readBuyReview(editBuyReview(draft, 3, { amount: "350,00" }));
  if (!corrected.ok) throw new Error(corrected.error);
  const saved = apply(state, corrected.value, TODAY);
  if (!saved.ok) throw new Error(saved.error);
  expect(saved.value.trades).toHaveLength(3);
  expect(apply(state, { ...corrected.value, date: "2026-09-26" }, TODAY)).toMatchObject({ ok: false, error: expect.stringContaining("depois de hoje") });
});
