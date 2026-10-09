import { expect, it } from "vitest";
import { apply, decimal, emptyPortfolio, suggestContribution, type PortfolioState, type PortfolioCommand } from "@/portfolio/domain";
import { openBuyReview, readBuyReview, editBuyReview, removeBuyReviewLine, changeBuyReviewDate, fillBuyReviewPtax, chooseBuyReviewTreasury, buyReviewTotals } from "./buyReviewDraft";

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
  expect(buyReviewTotals(changed)).toBeNull();
  expect(editBuyReview(changed, 99, { quantity: "1" })).toEqual(changed);
  const removed = removeBuyReviewLine(changed, 1);
  expect(buyReviewTotals(removed)).toEqual({ total: 230000, unallocated: 0, excess: 130000 });
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

function treasurySuggestion(contribution = 36852, price = 19962.99) {
  let state = emptyPortfolio();
  const commands: PortfolioCommand[] = [
    { type: "save-asset", asset: { ticker: "Selic", assetClass: "fixed-income", sourceId: "selic|2031-03-01", bond: { kind: "treasury-bond", maturityDate: "2031-03-01" } } },
    { type: "save-asset", asset: { ticker: "Prefixado", assetClass: "fixed-income", sourceId: "fixed|2029-01-01", bond: { kind: "treasury-bond", maturityDate: "2029-01-01" } } },
    { type: "save-asset", asset: { ticker: "AAPL", assetClass: "international-stocks" } },
    { type: "save-score", asset: 1, score: 10 },
    { type: "save-score", asset: 2, score: 8 },
    ...state.questionnaires.find(q => q.id === "stocks")!.questions.map(q => ({ type: "save-answer" as const, asset: 3, question: q.id, value: true })),
    { type: "save-targets", targets: { "domestic-stocks": 0, "international-stocks": 23, "fixed-income": 77, "real-estate-funds": 0, crypto: 0 } },
    { type: "save-asset", asset: { ticker: "CDB held", assetClass: "fixed-income", bond: { kind: "private-bond", bondType: "cdb", indexer: "fixed-rate", rate: decimal(10), maturityDate: "2028-01-01" } } },
    { type: "save-trade", trade: { asset: 4, kind: "buy", date: TODAY, amount: 347 } },
    { type: "save-trade", trade: { asset: 3, kind: "buy", date: TODAY, quantity: decimal(0.01), unitPrice: decimal(1), exchangeRate: 10000 } },
    { type: "record-quotes", quotes: [{ asset: 1, price: decimal(price), at: `${TODAY}T12:00:00` }, { asset: 2, price: decimal(2768), at: `${TODAY}T12:00:00` }, { asset: 3, price: decimal(1), at: `${TODAY}T12:00:00` }], exchangeRate: { rate: 10000, at: `${TODAY}T12:00:00` } },
  ];
  state = runCommands(state, commands);
  return { state, suggestion: contributionFor(state, contribution) };
}
function runCommands(state: PortfolioState, commands: PortfolioCommand[]) {
  for (const command of commands) {
    const result = apply(state, command, TODAY);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}
function contributionFor(state: PortfolioState, amount: number) {
  const result = suggestContribution(state, amount, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

it("chooses eligible zero-unit Selic using the original class share and registers only the chosen buys", () => {
  const { state, suggestion } = treasurySuggestion();
  const before = structuredClone(state);
  expect(suggestion).toMatchObject({ distributed: 36235, unallocated: 617 });
  const opened = openBuyReview(suggestion, TODAY);
  expect(opened.lines.map(l => l.asset)).toEqual([3, 2]);
  expect(opened.fixedIncome.budget).toBe(28297);
  expect(opened.fixedIncome.options.find(a => a.id === 1)).toMatchObject({ quantity: decimal(0.01), amount: 19963, belowMinimum: true });
  const reviewed = fillBuyReviewPtax(editBuyReview(opened, 3, { unitPrice: "1", quantity: "85,55" }), TODAY, { date: TODAY, rate: 10000 });
  const chosen = chooseBuyReviewTreasury(reviewed, 1);
  expect(chosen.lines.find(l => l.asset === 3)).toEqual(reviewed.lines.find(l => l.asset === 3));
  expect(chosen.lines.find(l => l.asset === 1)).toMatchObject({ quantity: "0,01", unitPrice: "19962,99" });
  expect(chosen.lines.map(l => l.asset)).toEqual([3, 1]);
  expect(buyReviewTotals(chosen)).toEqual({ total: 28518, unallocated: 8334, excess: 0 });
  expect(state).toEqual(before); // Cancelling simply discards this draft.
  const checked = readBuyReview(chosen);
  if (!checked.ok) throw new Error(checked.error);
  const saved = apply(state, checked.value, TODAY);
  if (!saved.ok) throw new Error(saved.error);
  expect(saved.value.trades.slice(state.trades.length)).toMatchObject([{ asset: 3, quantity: decimal(85.55) }, { asset: 1, quantity: decimal(0.01), unitPrice: decimal(19962.99) }]);
});

it("uses cent budgets at minimum-fraction boundaries without redistributing the remainder", () => {
  const { state } = treasurySuggestion();
  const fixedOnly = runCommands(state, [{ type: "save-targets", targets: { "domestic-stocks": 0, "international-stocks": 0, "fixed-income": 100, "real-estate-funds": 0, crypto: 0 } }]);
  for (const [amount, quantity, cost, remainder] of [
    [19962, 0, 0, 19962], [19963, 0.01, 19963, 0], [39925, 0.01, 19963, 19962], [39926, 0.02, 39926, 0],
  ]) {
    const opened = openBuyReview(contributionFor(fixedOnly, amount!), TODAY);
    expect(opened.fixedIncome.options.find(a => a.id === 1)).toMatchObject({ quantity: decimal(quantity!), amount: cost });
    const chosen = chooseBuyReviewTreasury(opened, 1);
    if (quantity === 0) expect(chosen).toEqual(opened);
    else {
      expect(chosen.lines.map(l => l.asset)).toEqual([1]);
      expect(buyReviewTotals(chosen)).toEqual({ total: cost, unallocated: remainder, excess: 0 });
    }
  }
  const zeroShare = runCommands(state, [{ type: "save-targets", targets: { "domestic-stocks": 0, "international-stocks": 100, "fixed-income": 0, "real-estate-funds": 0, crypto: 0 } }]);
  const draft = openBuyReview(contributionFor(zeroShare, 36852), TODAY);
  expect(draft.fixedIncome.options).toEqual([]);
  expect(chooseBuyReviewTreasury(draft, 1)).toEqual(draft);
});

it("keeps excluded titles and assets outside fixed-income Treasury unavailable", () => {
  const { state } = treasurySuggestion();
  const states: PortfolioState[] = [
    runCommands(state, [{ type: "save-score", asset: 1, score: 0 }]),
    runCommands(state, [{ type: "save-asset", asset: { ...state.assets[0]!, bond: { kind: "treasury-bond", maturityDate: TODAY } } }]),
    { ...state, scores: state.scores.filter(s => s.asset !== 1) },
    { ...state, quotes: state.quotes.filter(q => q.asset !== 1) },
    { ...state, quotes: state.quotes.map(q => q.asset === 1 ? { ...q, at: "2026-01-01T12:00:00" } : q) },
  ];
  for (const excluded of states) {
    const draft = openBuyReview(contributionFor(excluded, 36852), TODAY);
    expect(draft.fixedIncome.options.map(a => a.id)).toEqual([2]);
    for (const id of [1, 3, 4, 99]) expect(chooseBuyReviewTreasury(draft, id)).toEqual(draft);
  }
});

it("updates totals after real edits and removals, reports excess and preserves choices after refusal", () => {
  const { state, suggestion } = treasurySuggestion();
  let draft = chooseBuyReviewTreasury(fillBuyReviewPtax(openBuyReview(suggestion, TODAY), TODAY, { date: TODAY, rate: 10000 }), 1);
  expect(buyReviewTotals(draft)).toEqual({ total: 28518, unallocated: 8334, excess: 0 });
  draft = changeBuyReviewDate(editBuyReview(draft, 1, { quantity: "0,02", unitPrice: "20000" }), "2026-09-24");
  expect(buyReviewTotals(draft)).toBeNull();
  draft = fillBuyReviewPtax(draft, draft.date, { date: "2026-09-24", rate: 10000 });
  expect(buyReviewTotals(draft)).toEqual({ total: 48555, unallocated: 0, excess: 11703 });
  const excess = readBuyReview(draft);
  if (!excess.ok) throw new Error(excess.error);
  expect(apply(state, excess.value, TODAY).ok).toBe(true);
  const refused = editBuyReview(draft, 1, { quantity: "0" });
  const snapshot = structuredClone(refused);
  const checked = readBuyReview(refused);
  if (!checked.ok) throw new Error(checked.error);
  expect(apply(state, checked.value, TODAY).ok).toBe(false);
  expect(refused).toEqual(snapshot);
  expect(state.trades).toHaveLength(2);
  const corrected = readBuyReview(editBuyReview(refused, 1, { quantity: "0,01" }));
  if (!corrected.ok) throw new Error(corrected.error);
  const saved = apply(state, corrected.value, TODAY);
  if (!saved.ok) throw new Error(saved.error);
  expect(saved.value.trades.slice(2).map(t => t.date)).toEqual(["2026-09-24", "2026-09-24"]);
  const removed = removeBuyReviewLine(draft, 3);
  expect(buyReviewTotals(removed)).toEqual({ total: 40000, unallocated: 0, excess: 3148 });
  expect(buyReviewTotals(removeBuyReviewLine(removed, 1))).toEqual({ total: 0, unallocated: 36852, excess: 0 });
  expect(buyReviewTotals(editBuyReview(draft, 1, { unitPrice: "invalid" }))).toBeNull();
});
