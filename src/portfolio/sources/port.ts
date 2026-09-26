import type { AssetClass, Decimal, ExchangeRate, IsoDate, SourcePayout } from "@/portfolio/domain";

/** What a source needs to know of an asset to find it; `sourceId` is its id there, when kept. */
export type SourcedAsset = { ticker: string; assetClass: AssetClass; sourceId?: string | null };

/** A coin CoinGecko has with a ticker as its symbol: its id, name and market cap rank, if it has one. */
export type CryptoCandidate = { id: string; name: string; rank: number | null };

/** The BCB's selling PTAX, and the day it was published for. */
export type Ptax = { rate: ExchangeRate; date: IsoDate };

/** A payout the source announced for one unit: whoever held it at the end of the record date is paid on the payment date. */
export type AnnouncedPayout = Omit<SourcePayout, "asset">;

/**
 * The port of sources: what the portfolio asks outside, each question behind
 * an adapter that only translates the source's answer. A network or format
 * failure arrives as a rejected promise, never as empty data. Each question
 * arrives with the ticket that asks it.
 */
export type Sources = {
  /** The asset's last price per unit, in its currency, as an exact decimal. */
  latestQuote(asset: SourcedAsset): Promise<Decimal>;
  /** Whether the source knows the ticker of an asset of the B3's classes. */
  tickerExists(asset: SourcedAsset): Promise<boolean>;
  /** The ISIN the B3 gives the ticker, or null when the B3 doesn't list it. */
  isin(asset: SourcedAsset): Promise<string | null>;
  /** The coins whose symbol is the ticker, in the source's order; none when it doesn't know it. */
  searchCrypto(ticker: string): Promise<CryptoCandidate[]>;
  /** The current exchange rate, in reais per dollar. */
  currentExchangeRate(): Promise<ExchangeRate>;
  /** Every payout the source has of a B3 stock or fund, by its ISIN, paid or only announced. */
  payouts(asset: SourcedAsset): Promise<AnnouncedPayout[]>;
  /** The selling PTAX of the date or, on a day with none (weekend, holiday, today before it is published), the last one before. */
  sellingPtax(date: IsoDate): Promise<Ptax>;
};

/** A source that didn't answer, or answered something we can't read. The message is for the log. */
export class SourceError extends Error {
  override name = "SourceError";
}
