import { describe, expect, it } from "vitest";
import {
  apply,
  decimal,
  emptyPortfolio,
  projectPortfolio,
  type AssetToSave,
  type IsoDate,
  type PortfolioCommand,
  type PortfolioState,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("registering an asset", () => {
  it("creates the asset with its ticker and class, and it shows up in its class with quantity zero", () => {
    const state = saveOk(emptyPortfolio(), { ticker: "PETR4", assetClass: "domestic-stocks" });

    const view = projectPortfolio(state, TODAY);
    const domestic = view.classes.find((c) => c.key === "domestic-stocks")!;

    expect(domestic.assetCount).toBe(1);
    expect(domestic.assets).toEqual([
      expect.objectContaining({ ticker: "PETR4", quantity: 0, averagePrice: null, cost: 0, currentValue: 0, trades: [] }),
    ]);
  });

  it("accepts the classes in reais: Ações Nacionais, FIIs and Cripto", () => {
    const state = saveOk(
      emptyPortfolio(),
      { ticker: "PETR4", assetClass: "domestic-stocks" },
      { ticker: "HGLG11", assetClass: "real-estate-funds" },
      { ticker: "BTC", assetClass: "crypto" },
    );

    expect(projectPortfolio(state, TODAY).classes.map((c) => [c.key, c.assets.map((a) => a.ticker)])).toEqual([
      ["domestic-stocks", ["PETR4"]],
      ["international-stocks", []],
      ["fixed-income", []],
      ["real-estate-funds", ["HGLG11"]],
      ["crypto", ["BTC"]],
    ]);
  });

  it("the ticker is kept without surrounding spaces and in capitals", () => {
    const state = saveOk(emptyPortfolio(), { ticker: "  petr4 ", assetClass: "domestic-stocks" });

    expect(state.assets.map((a) => a.ticker)).toEqual(["PETR4"]);
  });

  it("refuses a ticker that already exists in the portfolio, in any class and any case", () => {
    const state = saveOk(emptyPortfolio(), { ticker: "BTC", assetClass: "crypto" });

    expect(save(state, { ticker: "btc", assetClass: "domestic-stocks" })).toEqual({
      ok: false,
      error: "Já existe um ativo BTC na carteira.",
    });
  });

  it("refuses Renda Fixa, whose bonds have their own registration, and Ações Internacionais, which arrive with the dollar", () => {
    expect(save(emptyPortfolio(), { ticker: "CDB INTER", assetClass: "fixed-income" })).toEqual({
      ok: false,
      error: "Os títulos de Renda Fixa têm cadastro próprio, que ainda não existe.",
    });
    expect(save(emptyPortfolio(), { ticker: "AAPL", assetClass: "international-stocks" })).toEqual({
      ok: false,
      error: "As Ações Internacionais chegam com o dólar e ainda não podem ser cadastradas.",
    });
  });

  it("refuses a blank ticker and a class that does not exist", () => {
    expect(save(emptyPortfolio(), { ticker: "  ", assetClass: "crypto" })).toEqual({
      ok: false,
      error: "Informe o código do ativo.",
    });
    expect(save(emptyPortfolio(), { ticker: "PETR4", assetClass: "stocks" } as never)).toEqual({
      ok: false,
      error: "Escolha a classe do ativo.",
    });
  });

  it("a correction changes the ticker and keeps the asset", () => {
    const created = saveOk(emptyPortfolio(), { ticker: "ELET3", assetClass: "domestic-stocks" });
    const id = created.assets[0]!.id;

    const corrected = saveOk(created, { id, ticker: "AXIA3", assetClass: "domestic-stocks" });

    expect(corrected.assets).toEqual([{ id, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: null }]);
  });

  it("keeps the asset's id at its source: the ISIN in the B3's classes, the CoinGecko id in crypto", () => {
    const state = saveOk(
      emptyPortfolio(),
      { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" },
      { ticker: "PEPE", assetClass: "crypto", sourceId: "pepe" },
      { ticker: "HGLG11", assetClass: "real-estate-funds" },
    );

    expect(state.assets.map((a) => [a.ticker, a.sourceId])).toEqual([
      ["PETR4", "BRPETRACNPR6"],
      ["PEPE", "pepe"],
      ["HGLG11", null],
    ]);
  });

  it("a correction changes the ticker and the source's id, and keeps the trades and payouts", () => {
    let state = saveOk(emptyPortfolio(), { ticker: "ELET3", assetClass: "domestic-stocks", sourceId: "BRELETACNOR6" });
    const id = state.assets[0]!.id;
    state = applyOk(state, { type: "save-trade", trade: { asset: id, kind: "buy", date: "2026-03-02", quantity: decimal(100), unitPrice: decimal(40) } });
    state = applyOk(state, { type: "save-payout", payout: { asset: id, date: "2026-06-15", kind: "dividend", amount: 1250 } });

    const corrected = saveOk(state, { id, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: "BRAXIAACNOR1" });

    expect(corrected.assets).toEqual([{ id, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: "BRAXIAACNOR1" }]);
    const axia = projectPortfolio(corrected, TODAY).classes.find((c) => c.key === "domestic-stocks")!.assets[0]!;
    expect(axia).toEqual(expect.objectContaining({ ticker: "AXIA3", quantity: decimal(100), payoutsReceived: 1250 }));
    expect(axia.trades).toHaveLength(1);
    expect(axia.payouts).toHaveLength(1);
  });

  it("refuses a source's id that is not text", () => {
    expect(save(emptyPortfolio(), { ticker: "BTC", assetClass: "crypto", sourceId: 42 } as never)).toEqual({
      ok: false,
      error: "O identificador do ativo na fonte é inválido.",
    });
  });

  it("a correction keeping its own ticker is not a repeated ticker", () => {
    const created = saveOk(emptyPortfolio(), { ticker: "PETR4", assetClass: "domestic-stocks" });
    const id = created.assets[0]!.id;

    expect(save(created, { id, ticker: "petr4", assetClass: "domestic-stocks" }).ok).toBe(true);
  });

  it("the class never changes after the registration", () => {
    const created = saveOk(emptyPortfolio(), { ticker: "HGLG11", assetClass: "domestic-stocks" });
    const id = created.assets[0]!.id;

    expect(save(created, { id, ticker: "HGLG11", assetClass: "real-estate-funds" })).toEqual({
      ok: false,
      error: "A classe de um ativo não muda depois do cadastro.",
    });
  });

  it("a correction of an asset that does not exist is refused", () => {
    expect(save(emptyPortfolio(), { id: 7, ticker: "PETR4", assetClass: "domestic-stocks" })).toEqual({
      ok: false,
      error: "Esse ativo não existe.",
    });
  });

  it("applying does not change the received state", () => {
    const state = saveOk(emptyPortfolio(), { ticker: "PETR4", assetClass: "domestic-stocks" });
    const copy = structuredClone(state);

    saveOk(state, { ticker: "VALE3", assetClass: "domestic-stocks" });
    saveOk(state, { id: state.assets[0]!.id, ticker: "PETR3", assetClass: "domestic-stocks" });

    expect(state).toEqual(copy);
  });
});

function save(state: PortfolioState, asset: AssetToSave) {
  return apply(state, { type: "save-asset", asset } satisfies PortfolioCommand, TODAY);
}

function applyOk(state: PortfolioState, command: PortfolioCommand): PortfolioState {
  const result = apply(state, command, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function saveOk(state: PortfolioState, ...assets: AssetToSave[]): PortfolioState {
  for (const asset of assets) {
    const result = save(state, asset);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  }
  return state;
}
