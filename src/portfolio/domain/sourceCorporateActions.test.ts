import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  exchangeRate,
  projectPortfolio,
  type AssetClass,
  type AssetView,
  type CorporateActionKind,
  type IsoDate,
  type PortfolioCommand,
  type PortfolioState,
  type SourceCorporateAction,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("corporate actions from the source", () => {
  it("are proposed only on a date with a position greater than zero, counting the trades before it", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-03-10", 100, 30),
      propose(sourceAction(1, "split", "2026-01-10", 1, 4), sourceAction(1, "split", "2026-03-10", 1, 2), sourceAction(1, "split", "2026-05-10", 1, 3)),
    );

    // On 03-10 the buy of the day comes after the action: there was nothing yet.
    expect(asset(state, "PETR4").pendingCorporateActions).toEqual([{ id: 1, date: "2026-05-10", kind: "split", ratio: { from: 1, to: 3 } }]);
  });

  it("a retroactive buy makes an old action appear, as pending", () => {
    const split = sourceAction(1, "split", "2026-01-10", 1, 4);
    const before = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-03-10", 100, 30), propose(split));
    expect(asset(before, "PETR4").pendingCorporateActions).toEqual([]);

    const after = run(before, buy(1, "2025-12-01", 10, 120), propose(split));

    expect(asset(after, "PETR4").pendingCorporateActions).toEqual([{ id: 1, date: "2026-01-10", kind: "split", ratio: { from: 1, to: 4 } }]);
  });

  it("a pending action doesn't change the quantity, and tags the asset as having one to confirm", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-01-10", 100, 30), propose(sourceAction(1, "split", "2026-03-10", 1, 4)));

    const petr = asset(state, "PETR4");
    expect(petr).toMatchObject({ quantity: decimal(100), averagePrice: 3_000, cost: 300_000 });
    expect(petr.tags).toContain("pending-corporate-action");
    expect(petr.corporateActions).toEqual([]);
  });

  it("a pending action doesn't count for the quantity of a later payout, nor lets a sale beyond the quantity", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-01-10", 100, 30), propose(sourceAction(1, "split", "2026-03-10", 1, 4)));

    expect(execute(state, sell(1, "2026-04-10", 200, 10))).toEqual({ ok: false, error: "Em 10/04/2026 havia só 100 PETR4 para vender." });
    const paid = run(state, {
      type: "record-source-payouts",
      payouts: [{ asset: 1, kind: "dividend", recordDate: "2026-04-10", paymentDate: "2026-04-20", perUnit: decimal(0.5) }],
    });
    expect(asset(paid, "PETR4").payouts.map((p) => p.amount)).toEqual([5_000]);
  });

  it("confirming applies the action, and takes the tag away", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      propose(sourceAction(1, "split", "2026-03-10", 1, 4)),
      { type: "confirm-corporate-action", id: 1 },
    );

    const petr = asset(state, "PETR4");
    expect(petr).toMatchObject({ quantity: decimal(400), averagePrice: 750, cost: 300_000 });
    expect(petr.tags).not.toContain("pending-corporate-action");
    expect(petr.pendingCorporateActions).toEqual([]);
    expect(petr.corporateActions).toEqual([{ id: 1, date: "2026-03-10", kind: "split", ratio: { from: 1, to: 4 } }]);
  });

  it("in dollars, confirming adjusts the position in dollars and in reais", () => {
    const state = run(
      withAssets(["AAPL", "international-stocks"]),
      buy(1, "2026-01-10", 10, 200, 5),
      propose(sourceAction(1, "split", "2026-03-10", 1, 4)),
      { type: "confirm-corporate-action", id: 1 },
    );

    const aapl = asset(state, "AAPL");
    expect(aapl).toMatchObject({ quantity: decimal(40), averagePrice: 25_000, cost: 1_000_000 });
    expect(aapl.inDollars).toMatchObject({ averagePrice: 5_000, cost: 200_000 });
  });

  it("a confirmed action is the person's: the source neither corrects nor recreates it", () => {
    const split = sourceAction(1, "split", "2026-03-10", 1, 4);
    let state = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-01-10", 100, 30), propose(split), { type: "confirm-corporate-action", id: 1 });

    state = run(state, { type: "save-corporate-action", action: { id: 1, asset: 1, kind: "split", date: "2026-03-11", ratio: { from: 1, to: 5 } } }, propose(split));

    const petr = asset(state, "PETR4");
    expect(petr.corporateActions).toEqual([{ id: 1, date: "2026-03-11", kind: "split", ratio: { from: 1, to: 5 } }]);
    expect(petr.pendingCorporateActions).toEqual([]);
    expect(petr.quantity).toBe(decimal(500));
  });

  it("confirming what would leave a later sale uncovered is refused, like a trade", () => {
    const state = run(
      withAssets(["MGLU3", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 2),
      sell(1, "2026-04-10", 50, 3),
      propose(sourceAction(1, "reverse-split", "2026-03-10", 10, 1)),
    );

    expect(execute(state, { type: "confirm-corporate-action", id: 1 })).toEqual({
      ok: false,
      error: "Isso deixaria sem cobertura a venda de MGLU3 de 10/04/2026.",
    });
  });

  it("a dismissed action never comes back, nor counts", () => {
    const split = sourceAction(1, "split", "2026-03-10", 1, 4);
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      propose(split),
      { type: "dismiss-corporate-action", id: 1 },
      propose(split),
    );

    const petr = asset(state, "PETR4");
    expect(petr.pendingCorporateActions).toEqual([]);
    expect(petr.corporateActions).toEqual([]);
    expect(petr.tags).not.toContain("pending-corporate-action");
    expect(petr.quantity).toBe(decimal(100));
  });

  it("a deleted action, which isn't a dismissed one, comes back as pending", () => {
    const split = sourceAction(1, "split", "2026-03-10", 1, 4);
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      propose(split),
      { type: "confirm-corporate-action", id: 1 },
      { type: "delete-corporate-action", id: 1 },
      propose(split),
    );

    const petr = asset(state, "PETR4");
    expect(petr.corporateActions).toEqual([]);
    expect(petr.pendingCorporateActions).toEqual([{ id: 1, date: "2026-03-10", kind: "split", ratio: { from: 1, to: 4 } }]);
    expect(petr.quantity).toBe(decimal(100));
  });

  it("the same proposal from the same origin doesn't duplicate the action", () => {
    const split = sourceAction(1, "split", "2026-03-10", 1, 4);
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-01-10", 100, 30), propose(split, split), propose(split));

    expect(asset(state, "PETR4").pendingCorporateActions).toHaveLength(1);
  });

  it("an action the person already entered by hand, on the same date and with the same ratio, is not proposed again", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      { type: "save-corporate-action", action: { asset: 1, kind: "split", date: "2026-03-10", ratio: { from: 1, to: 4 } } },
      propose(sourceAction(1, "split", "2026-03-10", 1, 4)),
    );

    expect(asset(state, "PETR4").pendingCorporateActions).toEqual([]);
    expect(asset(state, "PETR4").quantity).toBe(decimal(400));
  });

  it("another ratio on the same date is another proposal", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      propose(sourceAction(1, "split", "2026-03-10", 1, 4), sourceAction(1, "split", "2026-03-10", 1, 2)),
    );

    expect(asset(state, "PETR4").pendingCorporateActions).toHaveLength(2);
  });

  it("an action dated after today, of an asset deleted meanwhile or of a crypto is left out", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"], ["BTC", "crypto"]),
      buy(1, "2026-01-10", 100, 30),
      buy(2, "2026-01-10", 1, 300_000),
      propose(sourceAction(1, "split", "2026-10-10", 1, 4), sourceAction(2, "split", "2026-03-10", 1, 4), sourceAction(9, "split", "2026-03-10", 1, 4)),
    );

    expect(state.corporateActions).toEqual([]);
  });

  it("only a pending action is confirmed or dismissed", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      propose(sourceAction(1, "split", "2026-03-10", 1, 4)),
      { type: "confirm-corporate-action", id: 1 },
    );

    const refusal = { ok: false, error: "Esse evento não está pendente." };
    expect(execute(state, { type: "confirm-corporate-action", id: 1 })).toEqual(refusal);
    expect(execute(state, { type: "dismiss-corporate-action", id: 1 })).toEqual(refusal);
    expect(execute(state, { type: "confirm-corporate-action", id: 9 })).toEqual({ ok: false, error: "Esse evento não existe." });
  });

  it("a pending action is confirmed or dismissed before being corrected or deleted, and a dismissed one is gone", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      propose(sourceAction(1, "split", "2026-03-10", 1, 4), sourceAction(1, "split", "2026-05-10", 1, 2)),
      { type: "dismiss-corporate-action", id: 2 },
    );

    const pending = { ok: false, error: "Confirme ou descarte o evento pendente primeiro." };
    expect(execute(state, { type: "save-corporate-action", action: { id: 1, asset: 1, kind: "split", date: "2026-03-10", ratio: { from: 1, to: 5 } } })).toEqual(
      pending,
    );
    expect(execute(state, { type: "delete-corporate-action", id: 1 })).toEqual(pending);
    const gone = { ok: false, error: "Esse evento não existe." };
    expect(execute(state, { type: "save-corporate-action", action: { id: 2, asset: 1, kind: "split", date: "2026-05-10", ratio: { from: 1, to: 5 } } })).toEqual(gone);
    expect(execute(state, { type: "delete-corporate-action", id: 2 })).toEqual(gone);
  });

  it("a malformed proposal is refused, since it crosses the server's boundary", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-01-10", 100, 30));

    expect(execute(state, propose({ ...sourceAction(1, "split", "2026-03-10", 1, 4), ratio: { from: 0, to: 4 } }))).toEqual({
      ok: false,
      error: "A proporção tem que ter dois números inteiros maiores que zero.",
    });
    expect(execute(state, propose({ ...sourceAction(1, "split", "2026-03-10", 1, 4), date: "2026-02-30" }))).toEqual({
      ok: false,
      error: "Informe uma data válida.",
    });
  });

  it("deleting the asset takes its pending and dismissed actions", () => {
    const state = run(
      withAssets(["PETR4", "domestic-stocks"]),
      buy(1, "2026-01-10", 100, 30),
      propose(sourceAction(1, "split", "2026-03-10", 1, 4), sourceAction(1, "split", "2026-05-10", 1, 2)),
      { type: "dismiss-corporate-action", id: 2 },
      { type: "delete-trade", id: 1 },
      { type: "delete-asset", id: 1 },
    );

    expect(state.corporateActions).toEqual([]);
  });

  it("never changes the state it receives", () => {
    const state = run(withAssets(["PETR4", "domestic-stocks"]), buy(1, "2026-01-10", 100, 30), propose(sourceAction(1, "split", "2026-03-10", 1, 4)));
    const copy = structuredClone(state);

    run(state, propose(sourceAction(1, "split", "2026-05-10", 1, 2)));
    executeOk(state, { type: "confirm-corporate-action", id: 1 });
    executeOk(state, { type: "dismiss-corporate-action", id: 1 });

    expect(state).toEqual(copy);
  });
});

function sourceAction(asset: number, kind: CorporateActionKind, date: IsoDate, from: number, to: number): SourceCorporateAction {
  return { asset, kind, date, ratio: { from, to } };
}

function propose(...actions: SourceCorporateAction[]): PortfolioCommand {
  return { type: "record-source-corporate-actions", actions };
}

function buy(asset: number, date: IsoDate, quantity: number, unitPrice: number, rate?: number): PortfolioCommand {
  return trade("buy", asset, date, quantity, unitPrice, rate);
}

function sell(asset: number, date: IsoDate, quantity: number, unitPrice: number): PortfolioCommand {
  return trade("sell", asset, date, quantity, unitPrice);
}

function trade(kind: "buy" | "sell", asset: number, date: IsoDate, quantity: number, unitPrice: number, rate?: number): PortfolioCommand {
  return {
    type: "save-trade",
    trade: {
      asset,
      kind,
      date,
      quantity: decimal(quantity),
      unitPrice: decimal(unitPrice),
      ...(rate !== undefined && { exchangeRate: exchangeRate(rate) }),
    },
  };
}

function withAssets(...assets: [string, AssetClass][]): PortfolioState {
  let state = emptyPortfolio();
  for (const [ticker, assetClass] of assets) state = executeOk(state, { type: "save-asset", asset: { ticker, assetClass } });
  return state;
}

function execute(state: PortfolioState, c: PortfolioCommand) {
  return apply(state, c, TODAY);
}

function executeOk(state: PortfolioState, c: PortfolioCommand): PortfolioState {
  const result = execute(state, c);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function run(state: PortfolioState, ...commands: PortfolioCommand[]): PortfolioState {
  for (const c of commands) state = executeOk(state, c);
  return state;
}

function asset(state: PortfolioState, ticker: string): AssetView {
  return projectPortfolio(state, TODAY)
    .classes.flatMap((c) => c.assets)
    .find((a) => a.ticker === ticker)!;
}
