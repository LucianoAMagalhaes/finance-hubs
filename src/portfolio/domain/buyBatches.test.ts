import { expect, it } from "vitest";
import { apply, decimal, emptyPortfolio, projectPortfolio } from "@/portfolio/domain";

const TODAY = "2026-09-25";

it("refuses malformed batches and embedded corrections, dates or sales without changing existing purchases", () => {
  const registered = apply(emptyPortfolio(), { type: "save-asset", asset: { ticker: "PETR4", assetClass: "domestic-stocks" } }, TODAY);
  if (!registered.ok) throw new Error(registered.error);
  const bought = apply(registered.value, { type: "save-trade", trade: { asset: 1, kind: "buy", date: TODAY, quantity: decimal(2), unitPrice: decimal(30) } }, TODAY);
  if (!bought.ok) throw new Error(bought.error);
  const state = bought.value;
  const before = projectPortfolio(state, TODAY);
  for (const extra of [{ id: 1 }, { date: "2026-09-24" }, { kind: "sell" }]) {
    expect(apply(state, { type: "save-buys", date: TODAY, buys: [{ asset: 1, quantity: decimal(1), unitPrice: decimal(30), ...extra }] }, TODAY)).toMatchObject({ ok: false, error: expect.stringContaining("Linha 1 (PETR4)") });
  }
  for (const rows of ["[]", "null", "[null]", "[42]", '["invalid"]']) {
    expect(apply(state, { type: "save-buys", date: TODAY, buys: JSON.parse(rows) }, TODAY).ok).toBe(false);
  }
  expect(projectPortfolio(state, TODAY)).toEqual(before);
});
