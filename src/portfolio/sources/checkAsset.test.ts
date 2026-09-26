import { describe, expect, it } from "vitest";
import { apply, emptyPortfolio, type AssetToSave, type IsoDate, type PortfolioState } from "@/portfolio/domain";
import { checkAsset, SourceError, type CryptoCandidate, type Sources } from "@/portfolio/sources";

const TODAY: IsoDate = "2026-09-25";

const PEPES: CryptoCandidate[] = [
  { id: "pepe", name: "Pepe", rank: 54 },
  { id: "based-pepe", name: "Based Pepe", rank: 2110 },
];

describe("checking a ticker at the source, in the B3's classes", () => {
  it("a ticker the source knows is registered with the ISIN the B3 gives it", async () => {
    const sources = fakeSources({ known: ["PETR4", "HGLG11"], isins: { PETR4: "BRPETRACNPR6", HGLG11: "BRHGLGCTF004" } });

    expect(await check(emptyPortfolio(), { ticker: " petr4", assetClass: "domestic-stocks" }, sources)).toEqual({
      ok: true,
      asset: { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" },
    });
    expect(await check(emptyPortfolio(), { ticker: "HGLG11", assetClass: "real-estate-funds" }, sources)).toEqual({
      ok: true,
      asset: { ticker: "HGLG11", assetClass: "real-estate-funds", sourceId: "BRHGLGCTF004" },
    });
  });

  it("a ticker the source doesn't know is refused, with the reason", async () => {
    const sources = fakeSources({ known: [] });

    expect(await check(emptyPortfolio(), { ticker: "PETR44", assetClass: "domestic-stocks" }, sources)).toEqual({
      ok: false,
      error: "O Yahoo Finance não conhece o código PETR44: confira se ele foi digitado certo.",
    });
  });

  it("with the source down, the registration is accepted with no ISIN", async () => {
    const sources = fakeSources({ known: "down" });

    expect(await check(emptyPortfolio(), { ticker: "PETR4", assetClass: "domestic-stocks" }, sources)).toEqual({
      ok: true,
      asset: { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: null },
    });
  });

  it("a ticker the B3 doesn't list, or the B3 down, leaves the asset with no ISIN", async () => {
    const unlisted = fakeSources({ known: ["BOVA11"], isins: {} });
    const b3Down = fakeSources({ known: ["PETR4"], isins: "down" });

    expect(await check(emptyPortfolio(), { ticker: "BOVA11", assetClass: "domestic-stocks" }, unlisted)).toEqual({
      ok: true,
      asset: { ticker: "BOVA11", assetClass: "domestic-stocks", sourceId: null },
    });
    expect(await check(emptyPortfolio(), { ticker: "PETR4", assetClass: "domestic-stocks" }, b3Down)).toEqual({
      ok: true,
      asset: { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: null },
    });
  });

  it("the correction of the ticker goes through the same check", async () => {
    const state = withAsset({ ticker: "ELET3", assetClass: "domestic-stocks", sourceId: "BRELETACNOR6" });
    const sources = fakeSources({ known: ["AXIA3"], isins: { AXIA3: "BRAXIAACNOR1" } });

    expect(await check(state, { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks" }, sources)).toEqual({
      ok: true,
      asset: { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: "BRAXIAACNOR1" },
    });
    expect(await check(state, { id: 1, ticker: "AXIA33", assetClass: "domestic-stocks" }, sources)).toEqual({
      ok: false,
      error: "O Yahoo Finance não conhece o código AXIA33: confira se ele foi digitado certo.",
    });
  });

  it("with the source down, a correction keeps the id only while the ticker stays the same", async () => {
    const state = withAsset({ ticker: "ELET3", assetClass: "domestic-stocks", sourceId: "BRELETACNOR6" });
    const down = fakeSources({ known: "down" });
    const b3Down = fakeSources({ known: ["ELET3", "AXIA3"], isins: "down" });

    expect(await check(state, { id: 1, ticker: "elet3", assetClass: "domestic-stocks" }, down)).toEqual({
      ok: true,
      asset: { id: 1, ticker: "ELET3", assetClass: "domestic-stocks", sourceId: "BRELETACNOR6" },
    });
    expect(await check(state, { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks" }, down)).toEqual({
      ok: true,
      asset: { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: null },
    });
    expect(await check(state, { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks" }, b3Down)).toEqual({
      ok: true,
      asset: { id: 1, ticker: "AXIA3", assetClass: "domestic-stocks", sourceId: null },
    });
  });

  it("what the domain refuses is refused before asking any source", async () => {
    const state = withAsset({ ticker: "PETR4", assetClass: "domestic-stocks" });
    const sources = fakeSources({ known: ["PETR4"] });

    expect(await check(state, { ticker: "petr4", assetClass: "domestic-stocks" }, sources)).toEqual({
      ok: false,
      error: "Já existe um ativo PETR4 na carteira.",
    });
    expect(await check(state, { ticker: "CDB INTER", assetClass: "fixed-income" }, sources)).toEqual({
      ok: false,
      error: "Os títulos de Renda Fixa têm cadastro próprio, que ainda não existe.",
    });
    expect(sources.asked).toEqual([]);
  });
});

describe("checking an American ticker at Yahoo", () => {
  it("a ticker Yahoo knows is registered, with no id at the source", async () => {
    const sources = fakeSources({ known: ["KO"] });

    expect(await check(emptyPortfolio(), { ticker: "ko", assetClass: "international-stocks" }, sources)).toEqual({
      ok: true,
      asset: { ticker: "KO", assetClass: "international-stocks", sourceId: null },
    });
    expect(sources.asked).toEqual(["KO"]);
  });

  it("a ticker Yahoo doesn't know is refused, and with Yahoo down the registration is accepted", async () => {
    expect(await check(emptyPortfolio(), { ticker: "KOO", assetClass: "international-stocks" }, fakeSources({ known: [] }))).toEqual({
      ok: false,
      error: "O Yahoo Finance não conhece o código KOO: confira se ele foi digitado certo.",
    });
    expect(await check(emptyPortfolio(), { ticker: "KO", assetClass: "international-stocks" }, fakeSources({ known: "down" }))).toEqual({
      ok: true,
      asset: { ticker: "KO", assetClass: "international-stocks", sourceId: null },
    });
  });
});

describe("checking a crypto at CoinGecko", () => {
  it("with a single coin, the asset keeps its CoinGecko id and its ticker", async () => {
    const sources = fakeSources({ coins: { BTC: [{ id: "bitcoin", name: "Bitcoin", rank: 1 }] } });

    expect(await check(emptyPortfolio(), { ticker: "btc", assetClass: "crypto" }, sources)).toEqual({
      ok: true,
      asset: { ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" },
    });
  });

  it("with several coins, the person chooses from the list with name and rank", async () => {
    const sources = fakeSources({ coins: { PEPE: PEPES } });

    expect(await check(emptyPortfolio(), { ticker: "PEPE", assetClass: "crypto" }, sources)).toEqual({ ok: false, choose: PEPES });
  });

  it("the chosen coin is kept when it is one of the search's", async () => {
    const sources = fakeSources({ coins: { PEPE: PEPES } });

    expect(await check(emptyPortfolio(), { ticker: "PEPE", assetClass: "crypto", sourceId: "based-pepe" }, sources)).toEqual({
      ok: true,
      asset: { ticker: "PEPE", assetClass: "crypto", sourceId: "based-pepe" },
    });
    expect(await check(emptyPortfolio(), { ticker: "PEPE", assetClass: "crypto", sourceId: "bitcoin" }, sources)).toEqual({
      ok: false,
      choose: PEPES,
    });
  });

  it("correcting a crypto keeps its coin while the ticker stays, and never carries it to a new ticker", async () => {
    const state = withAsset({ ticker: "PEPE", assetClass: "crypto", sourceId: "based-pepe" });

    expect(await check(state, { id: 1, ticker: "PEPE", assetClass: "crypto" }, fakeSources({ coins: { PEPE: PEPES } }))).toEqual({
      ok: true,
      asset: { id: 1, ticker: "PEPE", assetClass: "crypto", sourceId: "based-pepe" },
    });
    expect(await check(state, { id: 1, ticker: "PEPE2", assetClass: "crypto" }, fakeSources({ coins: "down" }))).toEqual({
      ok: true,
      asset: { id: 1, ticker: "PEPE2", assetClass: "crypto", sourceId: null },
    });
  });

  it("a ticker CoinGecko doesn't know is refused, with the reason", async () => {
    expect(await check(emptyPortfolio(), { ticker: "XPTOXX", assetClass: "crypto" }, fakeSources({ coins: {} }))).toEqual({
      ok: false,
      error: "A CoinGecko não conhece o código XPTOXX: confira se ele foi digitado certo.",
    });
  });

  it("with CoinGecko down, the registration is accepted with the chosen coin, or none", async () => {
    const down = fakeSources({ coins: "down" });

    expect(await check(emptyPortfolio(), { ticker: "BTC", assetClass: "crypto" }, down)).toEqual({
      ok: true,
      asset: { ticker: "BTC", assetClass: "crypto", sourceId: null },
    });
    expect(await check(emptyPortfolio(), { ticker: "PEPE", assetClass: "crypto", sourceId: "pepe" }, down)).toEqual({
      ok: true,
      asset: { ticker: "PEPE", assetClass: "crypto", sourceId: "pepe" },
    });
  });

  it("the checked asset is what the domain saves", async () => {
    const sources = fakeSources({ coins: { BTC: [{ id: "bitcoin", name: "Bitcoin", rank: 1 }] } });
    const checked = await check(emptyPortfolio(), { ticker: "BTC", assetClass: "crypto" }, sources);
    if (!checked.ok) throw new Error("expected the check to pass");

    const saved = apply(emptyPortfolio(), { type: "save-asset", asset: checked.asset }, TODAY);

    expect(saved.ok && saved.value.assets).toEqual([{ id: 1, ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" }]);
  });
});

// ---------------------------------------------------------------- helpers

function check(state: PortfolioState, asset: AssetToSave, sources: Sources) {
  return checkAsset(state, asset, sources, TODAY);
}

function withAsset(asset: AssetToSave): PortfolioState {
  const result = apply(emptyPortfolio(), { type: "save-asset", asset }, TODAY);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

type Answers = {
  /** The tickers the B3's classes' source knows, or down. */
  known?: string[] | "down";
  /** The ISIN of each ticker the B3 lists, or down. */
  isins?: Record<string, string> | "down";
  /** The coins of each crypto ticker, or down. */
  coins?: Record<string, CryptoCandidate[]> | "down";
};

/** A port that answers from the answers given, and remembers the tickers asked. */
function fakeSources({ known = [], isins = {}, coins = {} }: Answers): Sources & { asked: string[] } {
  const asked: string[] = [];
  const down = () => new SourceError("down");
  return {
    asked,
    async latestQuote() {
      throw new Error("The check doesn't ask for quotes.");
    },
    async tickerExists({ ticker }) {
      asked.push(ticker);
      if (known === "down") throw down();
      return known.includes(ticker);
    },
    async isin({ ticker }) {
      if (isins === "down") throw down();
      return isins[ticker] ?? null;
    },
    async searchCrypto(ticker) {
      asked.push(ticker);
      if (coins === "down") throw down();
      return coins[ticker] ?? [];
    },
    async currentExchangeRate() {
      throw new Error("The check doesn't ask for the exchange rate.");
    },
    async payouts() {
      throw new Error("The check doesn't ask for payouts.");
    },
    async sellingPtax() {
      throw new Error("The check doesn't ask for the PTAX.");
    },
  };
}
