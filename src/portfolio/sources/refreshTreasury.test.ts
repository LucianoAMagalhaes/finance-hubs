import { describe, expect, it, vi } from "vitest";
import { apply, decimal, emptyPortfolio, type Asset, type IsoDateTime, type PortfolioCommand, type PortfolioState } from "@/portfolio/domain";
import { refresh, SourceError, type Sources, type TreasuryBondQuote } from "@/portfolio/sources";

const NOW: IsoDateTime = "2026-09-25T14:32:00";
const OLD: IsoDateTime = "2026-09-24T12:00:00";
const bonds: TreasuryBondQuote[] = [
  { name: "Tesouro IPCA+ 2035", maturityDate: "2035-05-15", sourceId: "ipca-plus|2035-05-15", price: decimal(2500) },
  { name: "Tesouro Selic 2031", maturityDate: "2031-03-01", sourceId: "selic|2031-03-01", price: decimal(20000) },
];
const asset = (bond: TreasuryBondQuote, id: number): Asset => ({
  id, ticker: bond.name, assetClass: "fixed-income", sourceId: bond.sourceId,
  bond: { kind: "treasury-bond", maturityDate: bond.maturityDate },
});
const expired: Asset = {
  id: 3, ticker: "Tesouro IPCA+ 2026", assetClass: "fixed-income", sourceId: "ipca-plus|2026-09-01",
  bond: { kind: "treasury-bond", maturityDate: "2026-09-01" },
};
const registered = (): PortfolioState => ({ ...emptyPortfolio(), assets: [asset(bonds[0]!, 1), asset(bonds[1]!, 2), expired] });
function run(state: PortfolioState, commands: PortfolioCommand[]): PortfolioState {
  for (const command of commands) {
    const next = apply(state, command, "2026-09-25");
    if (!next.ok) throw new Error(next.error);
    state = next.value;
  }
  return state;
}
function sources(answer: TreasuryBondQuote[] | Error = bonds) {
  const notAsked = async (): Promise<never> => { throw new Error("Unexpected source request."); };
  return {
    treasuryBonds: vi.fn(async () => { if (answer instanceof Error) throw answer; return answer; }),
    latestQuote: vi.fn(async () => decimal(37)),
    tickerExists: notAsked, isin: notAsked, searchCrypto: notAsked, currentExchangeRate: notAsked,
    payouts: notAsked, corporateActions: notAsked, sellingPtax: notAsked,
    dailyCdi: notAsked, monthlyIpca: notAsked, ipcaProjections: notAsked,
  } satisfies Sources;
}

describe("refreshing Treasury bonds", () => {
  it("quotes all due non-matured bonds with one list request and records their prices with the current time", async () => {
    const port = sources();
    const commands = await refresh(registered(), port, NOW, false);
    expect(port.treasuryBonds).toHaveBeenCalledTimes(1);
    expect(port.latestQuote).not.toHaveBeenCalled();
    expect(commands).toEqual([
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(2500), at: NOW }, { asset: 2, price: decimal(20000), at: NOW }] },
      { type: "record-fetch", kind: "quotes", at: NOW },
    ]);
    expect(run(registered(), commands).quotes).toEqual([
      { asset: 1, price: decimal(2500), at: NOW }, { asset: 2, price: decimal(20000), at: NOW },
    ]);
  });

  it("replaces only quotes older than fifteen minutes, keeping one exactly fifteen minutes old", async () => {
    const state = run(registered(), [{ type: "record-quotes", quotes: [
      { asset: 1, price: decimal(2300), at: "2026-09-25T14:17:00" },
      { asset: 2, price: decimal(19000), at: "2026-09-25T14:16:59" },
      { asset: 3, price: decimal(2100), at: OLD },
    ] }]);
    const port = sources();
    const commands = await refresh(state, port, NOW, false);
    expect(port.treasuryBonds).toHaveBeenCalledTimes(1);
    expect(commands[0]).toEqual({ type: "record-quotes", quotes: [{ asset: 2, price: decimal(20000), at: NOW }] });
    expect(run(state, commands).quotes).toEqual([
      { asset: 1, price: decimal(2300), at: "2026-09-25T14:17:00" },
      { asset: 2, price: decimal(20000), at: NOW }, { asset: 3, price: decimal(2100), at: OLD },
    ]);
  });

  it("asks nothing when every non-matured bond has a fresh quote", async () => {
    const state = run(registered(), [{ type: "record-quotes", quotes: [
      { asset: 1, price: decimal(2300), at: NOW }, { asset: 2, price: decimal(19000), at: NOW },
    ] }]);
    const port = sources();
    expect(await refresh(state, port, NOW, false)).toEqual([]);
    expect(port.treasuryBonds).not.toHaveBeenCalled();
  });

  it("forced refresh replaces fresh quotes but leaves expired titles and their last prices untouched", async () => {
    const state = run(registered(), [{ type: "record-quotes", quotes: [
      { asset: 1, price: decimal(2300), at: NOW }, { asset: 2, price: decimal(19000), at: NOW },
      { asset: 3, price: decimal(2100), at: OLD },
    ] }]);
    // Even an expired title erroneously present in the source cannot update its frozen price.
    const port = sources([...bonds, { name: expired.ticker, maturityDate: "2026-09-01", sourceId: expired.sourceId!, price: decimal(9999) }]);
    const commands = await refresh(state, port, NOW, true);
    expect(port.treasuryBonds).toHaveBeenCalledTimes(1);
    expect(run(state, commands).quotes).toEqual([
      { asset: 1, price: decimal(2500), at: NOW }, { asset: 2, price: decimal(20000), at: NOW },
      { asset: 3, price: decimal(2100), at: OLD },
    ]);
  });

  it("does not ask the source for a bond on its maturity date or afterwards, even when forced", async () => {
    for (const maturityDate of ["2026-09-25", "2026-09-01"] as const) {
      const state: PortfolioState = { ...emptyPortfolio(), assets: [{ ...expired, bond: { kind: "treasury-bond", maturityDate } }] };
      const port = sources();
      expect(await refresh(state, port, NOW, true)).toEqual([]);
      expect(port.treasuryBonds).not.toHaveBeenCalled();
      expect(port.latestQuote).not.toHaveBeenCalled();
    }
  });

  it("matches quotes by source identifier rather than list order or display name", async () => {
    const port = sources([{ ...bonds[1]!, name: "Updated source label" }, bonds[0]!]);
    const commands = await refresh(registered(), port, NOW, false);
    expect(run(registered(), commands).quotes).toEqual([
      { asset: 1, price: decimal(2500), at: NOW }, { asset: 2, price: decimal(20000), at: NOW },
    ]);
  });

  it("keeps every last quote and its date when the source fails and retries the next refresh", async () => {
    const state = run(registered(), [
      { type: "record-quotes", quotes: [{ asset: 1, price: decimal(2300), at: OLD }, { asset: 2, price: decimal(19000), at: OLD }] },
      { type: "record-fetch", kind: "quotes", at: OLD },
    ]);
    const port = sources(new SourceError("Treasury is down."));
    const commands = await refresh(state, port, NOW, false);
    expect(commands).toEqual([]);
    expect(run(state, commands)).toEqual(state);
    expect(await refresh(state, port, NOW, false)).toEqual([]);
    expect(port.treasuryBonds).toHaveBeenCalledTimes(2);
  });

  it("preserves a missing title's last quote while recording the titles still in the latest list", async () => {
    const state = run(registered(), [{ type: "record-quotes", quotes: [
      { asset: 1, price: decimal(2300), at: OLD }, { asset: 2, price: decimal(19000), at: OLD },
    ] }]);
    const commands = await refresh(state, sources([bonds[1]!]), NOW, false);
    expect(commands[0]).toEqual({ type: "record-quotes", quotes: [{ asset: 2, price: decimal(20000), at: NOW }] });
    expect(run(state, commands).quotes).toEqual([
      { asset: 1, price: decimal(2300), at: OLD }, { asset: 2, price: decimal(20000), at: NOW },
    ]);
  });

  it("does not stop another class's quotes when Treasury fails", async () => {
    const state: PortfolioState = { ...registered(), assets: [...registered().assets,
      { id: 4, ticker: "PETR4", assetClass: "domestic-stocks", sourceId: null },
    ] };
    const port = sources(new SourceError("Treasury is down."));
    const commands = await refresh(state, port, NOW, false);
    expect(commands).toEqual([
      { type: "record-quotes", quotes: [{ asset: 4, price: decimal(37), at: NOW }] },
      { type: "record-fetch", kind: "quotes", at: NOW },
    ]);
    expect(port.treasuryBonds).toHaveBeenCalledTimes(1);
  });
});
