import type { AssetClass, Decimal } from "@/portfolio/domain";

/** What a source needs to know of an asset to find it. */
export type SourcedAsset = { ticker: string; assetClass: AssetClass };

/**
 * The port of sources: what the portfolio asks outside, each question behind
 * an adapter that only translates the source's answer. A network or format
 * failure arrives as a rejected promise, never as empty data. Each question
 * arrives with the ticket that asks it.
 */
export type Sources = {
  /** The asset's last price per unit, in its currency, as an exact decimal. */
  latestQuote(asset: SourcedAsset): Promise<Decimal>;
};

/** A source that didn't answer, or answered something we can't read. The message is for the log. */
export class SourceError extends Error {
  override name = "SourceError";
}
