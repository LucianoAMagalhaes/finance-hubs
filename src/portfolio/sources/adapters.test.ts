import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decimal, exchangeRate } from "@/portfolio/domain";
import {
  b3CorporateActions,
  b3Isin,
  b3Payouts,
  bcbSellingPtax,
  coinGeckoQuote,
  coinGeckoSearch,
  SourceError,
  yahooCorporateActions,
  yahooExchangeRate,
  yahooQuote,
  yahooTickerExists,
} from "@/portfolio/sources";

// Real answers recorded in files: the suite never touches the network.
const recorded = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("the Yahoo adapter", () => {
  it("reads the last price of a B3 stock from the chart's JSON, asking by the .SA symbol", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-petr4.json"));

    expect(await yahooQuote({ ticker: "PETR4", assetClass: "domestic-stocks" }, fetch)).toBe(decimal(48.06));
    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/PETR4.SA?interval=1d&range=1d"]);
  });

  it("reads a FII the same way", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-hglg11.json"));

    expect(await yahooQuote({ ticker: "HGLG11", assetClass: "real-estate-funds" }, fetch)).toBe(decimal(147.83));
    expect(fetch.asked[0]).toContain("/chart/HGLG11.SA?");
  });

  it("reads an American stock in dollars, asking by the bare ticker", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-ko.json"));

    expect(await yahooQuote({ ticker: "KO", assetClass: "international-stocks" }, fetch)).toBe(decimal(87.645));
    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/KO?interval=1d&range=1d"]);
  });

  it("an unknown ticker, an error status, a changed format or a network failure is a failure, never an empty quote", async () => {
    const asset = { ticker: "XPTO99", assetClass: "domestic-stocks" } as const;

    await expect(yahooQuote(asset, fakeFetch(recorded("yahoo-chart-not-found.json"), 404))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, fakeFetch("Too Many Requests", 429))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, fakeFetch('{"chart":{"result":[{"meta":{}}]}}'))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, fakeFetch("<html>"))).rejects.toThrow(SourceError);
    await expect(yahooQuote(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the Yahoo ticker check", () => {
  it("a ticker whose chart has a price exists", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-petr4.json"));

    expect(await yahooTickerExists({ ticker: "PETR4", assetClass: "domestic-stocks" }, fetch)).toBe(true);
    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/PETR4.SA?interval=1d&range=1d"]);
  });

  it("an American ticker is checked by its bare symbol", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-ko.json"));

    expect(await yahooTickerExists({ ticker: "KO", assetClass: "international-stocks" }, fetch)).toBe(true);
    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/KO?interval=1d&range=1d"]);
  });

  it("a ticker Yahoo answers Not Found for doesn't exist", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-not-found.json"), 404);

    expect(await yahooTickerExists({ ticker: "XPTO99", assetClass: "real-estate-funds" }, fetch)).toBe(false);
  });

  it("any other error, a changed format or a network failure is a failure, not an unknown ticker", async () => {
    const asset = { ticker: "PETR4", assetClass: "domestic-stocks" } as const;

    await expect(yahooTickerExists(asset, fakeFetch("Too Many Requests", 429))).rejects.toThrow(SourceError);
    await expect(yahooTickerExists(asset, fakeFetch("Not Found", 404))).rejects.toThrow(SourceError);
    await expect(yahooTickerExists(asset, fakeFetch('{"chart":{"result":[{"meta":{}}]}}'))).rejects.toThrow(SourceError);
    await expect(yahooTickerExists(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the current exchange rate at Yahoo", () => {
  it("reads USDBRL=X's last price as reais per dollar, to 4 places", async () => {
    const fetch = fakeFetch(recorded("yahoo-chart-usdbrl.json"));

    expect(await yahooExchangeRate(fetch)).toBe(exchangeRate(5.1885));
    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/USDBRL%3DX?interval=1d&range=1d"]);
  });

  it("rounds a longer price to the 4th place", async () => {
    expect(await yahooExchangeRate(fakeFetch('{"chart":{"result":[{"meta":{"regularMarketPrice":5.18867}}]}}'))).toBe(51887);
  });

  it("an error status, a changed format or a network failure is a failure, never an empty rate", async () => {
    await expect(yahooExchangeRate(fakeFetch("Too Many Requests", 429))).rejects.toThrow(SourceError);
    await expect(yahooExchangeRate(fakeFetch('{"chart":{"result":[{"meta":{}}]}}'))).rejects.toThrow(SourceError);
    await expect(yahooExchangeRate(fakeFetch('{"chart":{"result":[{"meta":{"regularMarketPrice":0}}]}}'))).rejects.toThrow(SourceError);
    await expect(yahooExchangeRate(failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the BCB's PTAX", () => {
  it("is the selling PTAX of the last day published up to the date, asked over the two weeks before it", async () => {
    // Sunday 20/09: the last PTAX is Friday 18/09's.
    const fetch = fakeFetch(recorded("bcb-ptax-until-2026-09-20.json"));

    expect(await bcbSellingPtax("2026-09-20", fetch)).toEqual({ rate: exchangeRate(5.1575), date: "2026-09-18" });
    expect(fetch.asked).toEqual([
      "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
        "?@dataInicial='09-06-2026'&@dataFinalCotacao='09-20-2026'&$format=json&$select=cotacaoVenda,dataHoraCotacao",
    ]);
  });

  it("on a day with its own PTAX, it is that day's", async () => {
    const until17 = JSON.parse(recorded("bcb-ptax-until-2026-09-20.json"));
    until17.value = until17.value.slice(0, -1);

    expect(await bcbSellingPtax("2026-09-17", fakeFetch(JSON.stringify(until17)))).toEqual({ rate: exchangeRate(5.1521), date: "2026-09-17" });
  });

  it("no PTAX in the window, an error status, a changed format or a network failure is a failure", async () => {
    await expect(bcbSellingPtax("2026-09-20", fakeFetch(recorded("bcb-ptax-weekend.json")))).rejects.toThrow(SourceError);
    await expect(bcbSellingPtax("2026-09-20", fakeFetch("Service Unavailable", 503))).rejects.toThrow(SourceError);
    await expect(bcbSellingPtax("2026-09-20", fakeFetch('{"value":[{"cotacaoVenda":"5,1","dataHoraCotacao":"2026-09-18 13:03"}]}'))).rejects.toThrow(
      SourceError,
    );
    await expect(bcbSellingPtax("2026-09-20", fakeFetch('{"error":{}}'))).rejects.toThrow(SourceError);
    await expect(bcbSellingPtax("2026-09-20", failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the B3's ISIN", () => {
  const petrobras = routedFetch({
    GetInitialCompanies: recorded("b3-companies-petr4.json"),
    GetDetail: recorded("b3-detail-petrobras.json"),
  });

  it("finds the company by the ticker, and its GetDetail gives each ticker's ISIN", async () => {
    expect(await b3Isin({ ticker: "PETR4", assetClass: "domestic-stocks" }, petrobras)).toBe("BRPETRACNPR6");
    expect(await b3Isin({ ticker: "PETR3", assetClass: "domestic-stocks" }, petrobras)).toBe("BRPETRACNOR9");
    expect(petrobras.asked.map(decodeB3)).toEqual([
      ["GetInitialCompanies", { language: "pt-br", pageNumber: 1, pageSize: 20, company: "PETR4" }],
      ["GetDetail", { codeCVM: "9512", language: "pt-br" }],
      ["GetInitialCompanies", { language: "pt-br", pageNumber: 1, pageSize: 20, company: "PETR3" }],
      ["GetDetail", { codeCVM: "9512", language: "pt-br" }],
    ]);
  });

  it("a ticker the B3 doesn't list among the companies, like an ETF, has no ISIN", async () => {
    const unknown = routedFetch({ GetInitialCompanies: recorded("b3-companies-unknown.json") });

    expect(await b3Isin({ ticker: "BOVA11", assetClass: "domestic-stocks" }, unknown)).toBeNull();
    expect(await b3Isin({ ticker: "PETR9", assetClass: "domestic-stocks" }, petrobras)).toBeNull();
  });

  it("a FII's ISIN is its quota's, read from the fund's supplement, never a subscription receipt's", async () => {
    const fetch = routedFetch({ GetListedSupplementFunds: recorded("b3-funds-supplement-hglg.json") });

    expect(await b3Isin({ ticker: "HGLG11", assetClass: "real-estate-funds" }, fetch)).toBe("BRHGLGCTF004");
    expect(fetch.asked.map(decodeB3)).toEqual([["GetListedSupplementFunds", { cnpj: "0", identifierFund: "HGLG", typeFund: 7 }]]);
  });

  it("a fund the B3 answers nothing for has no ISIN", async () => {
    expect(await b3Isin({ ticker: "XPTO11", assetClass: "real-estate-funds" }, fakeFetch(""))).toBeNull();
  });

  it("an error status, a changed format or a network failure is a failure", async () => {
    const asset = { ticker: "PETR4", assetClass: "domestic-stocks" } as const;

    await expect(b3Isin(asset, fakeFetch("Service Unavailable", 503))).rejects.toThrow(SourceError);
    await expect(b3Isin(asset, fakeFetch('{"page":{}}'))).rejects.toThrow(SourceError);
    await expect(b3Isin({ ticker: "HGLG11", assetClass: "real-estate-funds" }, fakeFetch("<html>"))).rejects.toThrow(SourceError);
    await expect(b3Isin(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the B3's payouts", () => {
  it("a company's come from its supplement, only the ISIN's, each with kind, value per unit, record date and payment date", async () => {
    const fetch = routedFetch({ GetListedSupplementCompany: recorded("b3-company-supplement-petr.json") });

    const payouts = await b3Payouts({ ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" }, fetch);

    expect(fetch.asked.map(decodeB3)).toEqual([["GetListedSupplementCompany", { issuingCompany: "PETR", language: "pt-br" }]]);
    expect(payouts).toHaveLength(12);
    expect(payouts.slice(0, 3)).toEqual([
      { kind: "dividend", recordDate: "2026-08-21", paymentDate: "2026-12-21", perUnit: decimal(0.47156696) },
      { kind: "interest-on-equity", recordDate: "2026-08-21", paymentDate: "2026-12-21", perUnit: decimal(0.20250435) },
      { kind: "interest-on-equity", recordDate: "2026-08-21", paymentDate: "2026-11-23", perUnit: decimal(0.67407131) },
    ]);
    // The monetary update of a company's dividend comes as RENDIMENTO: a dividend, not a fund's income.
    expect(payouts.filter((p) => p.perUnit === decimal(0.01649003))).toEqual([
      { kind: "dividend", recordDate: "2026-04-22", paymentDate: "2026-05-20", perUnit: decimal(0.01649003) },
    ]);
  });

  it("the other ticker of the same company brings its own ISIN's", async () => {
    const fetch = routedFetch({ GetListedSupplementCompany: recorded("b3-company-supplement-petr.json") });

    const payouts = await b3Payouts({ ticker: "PETR3", assetClass: "domestic-stocks", sourceId: "BRPETRACNOR9" }, fetch);

    expect(payouts).toHaveLength(12);
  });

  it("a FII's come from the fund's supplement, only its quota's, never a subscription receipt's", async () => {
    const fetch = routedFetch({ GetListedSupplementFunds: recorded("b3-funds-supplement-hglg.json") });

    const payouts = await b3Payouts({ ticker: "HGLG11", assetClass: "real-estate-funds", sourceId: "BRHGLGCTF004" }, fetch);

    expect(fetch.asked.map(decodeB3)).toEqual([["GetListedSupplementFunds", { cnpj: "0", identifierFund: "HGLG", typeFund: 7 }]]);
    expect(payouts).toHaveLength(12);
    expect(payouts[0]).toEqual({ kind: "fund-income", recordDate: "2026-08-31", paymentDate: "2026-09-15", perUnit: decimal(1.17) });
    expect(payouts.filter((p) => p.paymentDate === "2026-05-15")).toHaveLength(1);
  });

  it("what isn't a payout, like an amortization, and a row still with no payment date are left out", async () => {
    const row = { isinCode: "BRXPTOCTF000", lastDatePrior: "30/04/2026", rate: "1,00000000000", remarks: "" };
    const answer = JSON.stringify({
      cashDividends: [
        { ...row, label: "AMORTIZACAO", paymentDate: "15/05/2026" },
        { ...row, label: "RENDIMENTO", paymentDate: "" },
        { ...row, label: "RENDIMENTO", paymentDate: "15/05/2026" },
      ],
    });

    expect(await b3Payouts({ ticker: "XPTO11", assetClass: "real-estate-funds", sourceId: "BRXPTOCTF000" }, fakeFetch(answer))).toEqual([
      { kind: "fund-income", recordDate: "2026-04-30", paymentDate: "2026-05-15", perUnit: decimal(1) },
    ]);
  });

  it("reads the value per unit exactly from the text, rounded at the eighth place", async () => {
    const answer = (rate: string) =>
      JSON.stringify({ cashDividends: [{ isinCode: "BRXPTOCTF000", label: "RENDIMENTO", lastDatePrior: "30/04/2026", paymentDate: "15/05/2026", rate }] });
    const perUnit = async (rate: string) =>
      (await b3Payouts({ ticker: "XPTO11", assetClass: "real-estate-funds", sourceId: "BRXPTOCTF000" }, fakeFetch(answer(rate))))[0]!.perUnit;

    expect(await perUnit("0,12345678500")).toBe(12_345_679);
    expect(await perUnit("0,12345678499")).toBe(12_345_678);
    await expect(perUnit("1.234,5")).rejects.toThrow(SourceError);
  });

  it("a company or a fund the B3 answers nothing for brings none", async () => {
    expect(await b3Payouts({ ticker: "XPTO3", assetClass: "domestic-stocks", sourceId: "BRXPTOACNOR0" }, fakeFetch(""))).toEqual([]);
    expect(await b3Payouts({ ticker: "XPTO11", assetClass: "real-estate-funds", sourceId: "BRXPTOCTF000" }, fakeFetch(""))).toEqual([]);
  });

  it("an asset with no ISIN, an error status, a changed format or a network failure is a failure, never an empty list", async () => {
    const asset = { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" } as const;
    const withRow = (row: object) => JSON.stringify([{ cashDividends: [{ isinCode: "BRPETRACNPR6", label: "DIVIDENDO", ...row }] }]);
    const good = { lastDatePrior: "21/08/2026", paymentDate: "21/12/2026", rate: "0,47156696000" };

    await expect(b3Payouts({ ...asset, sourceId: null }, fakeFetch(recorded("b3-company-supplement-petr.json")))).rejects.toThrow(SourceError);
    await expect(b3Payouts(asset, fakeFetch("Service Unavailable", 503))).rejects.toThrow(SourceError);
    await expect(b3Payouts(asset, fakeFetch('[{"code":"PETR"}]'))).rejects.toThrow(SourceError);
    await expect(b3Payouts(asset, fakeFetch(withRow({ ...good, rate: "abc" })))).rejects.toThrow(SourceError);
    await expect(b3Payouts(asset, fakeFetch(withRow({ ...good, rate: "0,00000000000" })))).rejects.toThrow(SourceError);
    await expect(b3Payouts(asset, fakeFetch(withRow({ ...good, lastDatePrior: "2026-08-21" })))).rejects.toThrow(SourceError);
    await expect(b3Payouts(asset, fakeFetch(withRow({ ...good, paymentDate: "31/02/2026" })))).rejects.toThrow(SourceError);
    await expect(b3Payouts(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the B3's corporate actions", () => {
  it("a company's come from its supplement, only the ISIN's: a split and a bonus in percent, a reverse split as the multiplier", async () => {
    const fetch = routedFetch({ GetListedSupplementCompany: recorded("b3-company-supplement-petr.json") });

    const actions = await b3CorporateActions({ ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" }, fetch);

    expect(fetch.asked.map(decodeB3)).toEqual([["GetListedSupplementCompany", { issuingCompany: "PETR", language: "pt-br" }]]);
    // Each counts from the first weekday after the record date.
    expect(actions).toEqual([
      // "100,00000000000": 100% more, 1 → 2 (record date on Friday 25/04/2008).
      { kind: "split", date: "2008-04-28", ratio: { from: 1, to: 2 } },
      // "0,01000000000": the multiplier, 100 → 1.
      { kind: "reverse-split", date: "2000-06-22", ratio: { from: 100, to: 1 } },
      // "33,33333333300": a third more, 1 new for each 3.
      { kind: "bonus", date: "1994-03-28", ratio: { from: 3, to: 4 } },
    ]);
  });

  it("a FII's come from the fund's supplement", async () => {
    const fetch = routedFetch({ GetListedSupplementFunds: recorded("b3-funds-supplement-hglg.json") });

    const actions = await b3CorporateActions({ ticker: "HGLG11", assetClass: "real-estate-funds", sourceId: "BRHGLGCTF004" }, fetch);

    // "900,00000000000": 900% more, 1 → 10.
    expect(actions).toEqual([{ kind: "split", date: "2018-04-18", ratio: { from: 1, to: 10 } }]);
  });

  it("a bonus in another ISIN, and what doesn't change the number of units, are left out", async () => {
    const isin = "BRPETRACNPR6";
    const rows = [
      { isinCode: isin, assetIssued: "BRPETRACNOR9", label: "BONIFICACAO", factor: "10,00000000000", lastDatePrior: "10/03/2026" },
      { isinCode: isin, assetIssued: isin, label: "CIS RED CAP", factor: "5,00000000000", lastDatePrior: "10/03/2026" },
      { isinCode: isin, assetIssued: isin, label: "BONIFICACAO", factor: "10,00000000000", lastDatePrior: "10/03/2026" },
    ];

    const actions = await b3CorporateActions({ ticker: "PETR4", assetClass: "domestic-stocks", sourceId: isin }, fakeFetch(JSON.stringify([{ stockDividends: rows }])));

    expect(actions).toEqual([{ kind: "bonus", date: "2026-03-11", ratio: { from: 10, to: 11 } }]);
  });

  it("a company or a fund the B3 answers nothing for brings none", async () => {
    expect(await b3CorporateActions({ ticker: "XPTO3", assetClass: "domestic-stocks", sourceId: "BRXPTOACNOR0" }, fakeFetch(""))).toEqual([]);
    expect(await b3CorporateActions({ ticker: "XPTO11", assetClass: "real-estate-funds", sourceId: "BRXPTOCTF000" }, fakeFetch(""))).toEqual([]);
  });

  it("an asset with no ISIN, an error status, a changed format or a network failure is a failure, never an empty list", async () => {
    const asset = { ticker: "PETR4", assetClass: "domestic-stocks", sourceId: "BRPETRACNPR6" } as const;
    const withRow = (row: object) =>
      JSON.stringify([{ stockDividends: [{ isinCode: "BRPETRACNPR6", assetIssued: "BRPETRACNPR6", label: "DESDOBRAMENTO", ...row }] }]);
    const good = { lastDatePrior: "25/04/2008", factor: "100,00000000000" };

    expect(await b3CorporateActions(asset, fakeFetch(withRow(good)))).toHaveLength(1);
    await expect(b3CorporateActions({ ...asset, sourceId: null }, fakeFetch(recorded("b3-company-supplement-petr.json")))).rejects.toThrow(SourceError);
    await expect(b3CorporateActions(asset, fakeFetch("Service Unavailable", 503))).rejects.toThrow(SourceError);
    await expect(b3CorporateActions(asset, fakeFetch('[{"code":"PETR"}]'))).rejects.toThrow(SourceError);
    await expect(b3CorporateActions(asset, fakeFetch(withRow({ ...good, factor: "100" })))).rejects.toThrow(SourceError);
    await expect(b3CorporateActions(asset, fakeFetch(withRow({ ...good, factor: "0,00000000000" })))).rejects.toThrow(SourceError);
    await expect(b3CorporateActions(asset, fakeFetch(withRow({ ...good, factor: "0,31415926535" })))).rejects.toThrow(SourceError);
    await expect(b3CorporateActions(asset, fakeFetch(withRow({ ...good, lastDatePrior: "2008-04-25" })))).rejects.toThrow(SourceError);
    await expect(b3CorporateActions(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("Yahoo's corporate actions", () => {
  it("are an American stock's splits over its whole history, by the ex date, as the smallest integers", async () => {
    const fetch = fakeFetch(recorded("yahoo-splits-ge.json"));

    const actions = await yahooCorporateActions({ ticker: "GE", assetClass: "international-stocks" }, fetch);

    expect(fetch.asked).toEqual(["https://query2.finance.yahoo.com/v8/finance/chart/GE?interval=3mo&range=max&events=split"]);
    expect(actions).toHaveLength(10);
    expect(actions.slice(-4)).toEqual([
      // A spin-off Yahoo adjusts as a split, "104:100": the person dismisses it.
      { kind: "split", date: "2019-02-26", ratio: { from: 25, to: 26 } },
      // "1:8": a reverse split, 8 → 1.
      { kind: "reverse-split", date: "2021-08-02", ratio: { from: 8, to: 1 } },
      { kind: "split", date: "2023-01-04", ratio: { from: 1000, to: 1281 } },
      { kind: "split", date: "2024-04-02", ratio: { from: 1000, to: 1253 } },
    ]);
    expect(actions[5]).toEqual({ kind: "split", date: "2000-05-08", ratio: { from: 1, to: 3 } });
  });

  it("a chart with no split brings none", async () => {
    expect(await yahooCorporateActions({ ticker: "KO", assetClass: "international-stocks" }, fakeFetch(recorded("yahoo-chart-ko.json")))).toEqual([]);
  });

  it("an error status, a changed format or a network failure is a failure, never an empty list", async () => {
    const asset = { ticker: "GE", assetClass: "international-stocks" } as const;
    const withSplit = (split: object) => JSON.stringify({ chart: { result: [{ meta: { gmtoffset: -14400 }, events: { splits: { 1: split } } }] } });

    expect(await yahooCorporateActions(asset, fakeFetch(withSplit({ date: 1627911000, numerator: 1.5, denominator: 1 })))).toEqual([
      { kind: "split", date: "2021-08-02", ratio: { from: 2, to: 3 } },
    ]);
    await expect(yahooCorporateActions(asset, fakeFetch(recorded("yahoo-chart-not-found.json"), 404))).rejects.toThrow(SourceError);
    await expect(yahooCorporateActions(asset, fakeFetch("Too Many Requests", 429))).rejects.toThrow(SourceError);
    await expect(yahooCorporateActions(asset, fakeFetch('{"chart":{"result":[]}}'))).rejects.toThrow(SourceError);
    await expect(yahooCorporateActions(asset, fakeFetch(withSplit({ date: 1627911000, numerator: 1, denominator: 0 })))).rejects.toThrow(SourceError);
    await expect(yahooCorporateActions(asset, fakeFetch(withSplit({ numerator: 2, denominator: 1 })))).rejects.toThrow(SourceError);
    await expect(yahooCorporateActions(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the CoinGecko search", () => {
  it("brings the coins whose symbol is the ticker, with name and market cap rank", async () => {
    const fetch = fakeFetch(recorded("coingecko-search-btc.json"));

    expect(await coinGeckoSearch("btc", fetch)).toEqual([{ id: "bitcoin", name: "Bitcoin", rank: 1 }]);
    expect(fetch.asked).toEqual(["https://api.coingecko.com/api/v3/search?query=BTC"]);
  });

  it("brings every coin sharing the symbol, in CoinGecko's order", async () => {
    expect(await coinGeckoSearch("PEPE", fakeFetch(recorded("coingecko-search-pepe.json")))).toEqual([
      { id: "pepe", name: "Pepe", rank: 54 },
      { id: "based-pepe", name: "Based Pepe", rank: 2110 },
      { id: "pepe-sol", name: "Pepe on SOL", rank: 2866 },
      { id: "pepecoin-on-solana", name: "PepeCoin on Solana", rank: 3335 },
    ]);
  });

  it("a coin with no rank comes with none", async () => {
    const answer = '{"coins":[{"id":"new-coin","name":"New Coin","symbol":"NEW","market_cap_rank":null}]}';

    expect(await coinGeckoSearch("NEW", fakeFetch(answer))).toEqual([{ id: "new-coin", name: "New Coin", rank: null }]);
  });

  it("a ticker CoinGecko doesn't know brings no coin", async () => {
    expect(await coinGeckoSearch("XPTOXX", fakeFetch(recorded("coingecko-search-unknown.json")))).toEqual([]);
  });

  it("an error status, a changed format or a network failure is a failure, not an unknown ticker", async () => {
    await expect(coinGeckoSearch("BTC", fakeFetch('{"status":{"error_code":429}}', 429))).rejects.toThrow(SourceError);
    await expect(coinGeckoSearch("BTC", fakeFetch('{"status":{}}'))).rejects.toThrow(SourceError);
    await expect(coinGeckoSearch("BTC", failingFetch())).rejects.toThrow(SourceError);
  });
});

describe("the CoinGecko adapter", () => {
  it("reads the price in reais, with no key, asking by the ticker as a symbol", async () => {
    const fetch = fakeFetch(recorded("coingecko-price-btc.json"));

    expect(await coinGeckoQuote({ ticker: "BTC", assetClass: "crypto" }, fetch)).toBe(decimal(435_401));
    expect(fetch.asked).toEqual(["https://api.coingecko.com/api/v3/simple/price?symbols=btc&vs_currencies=brl"]);
  });

  it("asks by the coin's id once the registration kept it", async () => {
    const fetch = fakeFetch(recorded("coingecko-price-bitcoin-by-id.json"));

    expect(await coinGeckoQuote({ ticker: "BTC", assetClass: "crypto", sourceId: "bitcoin" }, fetch)).toBe(decimal(435_932));
    expect(fetch.asked).toEqual(["https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl"]);
  });

  it("keeps a price below a cent to the eighth place", async () => {
    const fetch = fakeFetch('{"shib":{"brl":0.00006412}}');

    expect(await coinGeckoQuote({ ticker: "SHIB", assetClass: "crypto" }, fetch)).toBe(6412);
  });

  it("a price that rounds to nothing at the eighth place is a failure, not a zero quote", async () => {
    await expect(coinGeckoQuote({ ticker: "DUST", assetClass: "crypto" }, fakeFetch('{"dust":{"brl":0.000000001}}'))).rejects.toThrow(
      SourceError,
    );
  });

  it("an unknown ticker, an error status or a network failure is a failure, never an empty quote", async () => {
    const asset = { ticker: "XPTOXX", assetClass: "crypto" } as const;

    await expect(coinGeckoQuote(asset, fakeFetch(recorded("coingecko-price-unknown.json")))).rejects.toThrow(SourceError);
    await expect(coinGeckoQuote(asset, fakeFetch('{"status":{"error_code":429}}', 429))).rejects.toThrow(SourceError);
    await expect(coinGeckoQuote(asset, failingFetch())).rejects.toThrow(SourceError);
  });
});

// ---------------------------------------------------------------- helpers

/** A fetch that answers every request with that body and status, and remembers the URLs asked. */
function fakeFetch(body: string, status = 200): typeof fetch & { asked: string[] } {
  const asked: string[] = [];
  const f = async (input: string | URL | Request) => {
    asked.push(String(input));
    return new Response(body, { status });
  };
  return Object.assign(f, { asked }) as typeof fetch & { asked: string[] };
}

/** A fetch that answers each B3 call by its name in the URL, 404 for the others, and remembers the URLs asked. */
function routedFetch(bodies: Record<string, string>): typeof fetch & { asked: string[] } {
  const asked: string[] = [];
  const f = async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const call = Object.keys(bodies).find((name) => url.includes(`/${name}/`));
    return call ? new Response(bodies[call]) : new Response("Not Found", { status: 404 });
  };
  return Object.assign(f, { asked }) as typeof fetch & { asked: string[] };
}

/** The B3's call and the JSON it carries in Base64 at the end of the URL. */
function decodeB3(url: string): [string, unknown] {
  const [call, encoded] = url.split("/").slice(-2) as [string, string];
  return [call, JSON.parse(Buffer.from(decodeURIComponent(encoded), "base64").toString("utf8"))];
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}
