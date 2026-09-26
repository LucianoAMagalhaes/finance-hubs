import { DECIMAL_PLACES, type Decimal, type PayoutKind } from "@/portfolio/domain";
import { isValidDate, type IsoDate } from "@/shared";
import { getJson } from "./http";
import { SourceError, type AnnouncedPayout, type SourcedAsset } from "./port";

// The JSON the B3's own site reads, with no key. Not a documented API, and its
// terms allow only personal use: a risk accepted in the map (#59). Each call
// takes its parameters as JSON in Base64 at the end of the URL.

const LISTED = "https://sistemaswebb3-listados.b3.com.br";

const b3Url = (path: string, params: object) =>
  `${LISTED}/${path}/${encodeURIComponent(Buffer.from(JSON.stringify(params)).toString("base64"))}`;

/**
 * The ISIN the B3 gives the ticker, or null when the B3 doesn't list it. A
 * company is found by the ticker, and its `GetDetail` lists each ticker with
 * its ISIN. A fund's detail has no ISIN, so it comes from the fund's
 * supplement: the ISIN of its quota, whose ISIN code is "CTF".
 */
export async function b3Isin(asset: SourcedAsset, fetchFn: typeof fetch = fetch): Promise<string | null> {
  return asset.assetClass === "real-estate-funds" ? fundIsin(asset.ticker, fetchFn) : companyIsin(asset.ticker, fetchFn);
}

async function companyIsin(ticker: string, fetchFn: typeof fetch): Promise<string | null> {
  const search = (await getJson(
    b3Url("listedCompaniesProxy/CompanyCall/GetInitialCompanies", { language: "pt-br", pageNumber: 1, pageSize: 20, company: ticker }),
    fetchFn,
  )) as { results?: { codeCVM?: unknown; issuingCompany?: unknown }[] } | null;
  if (!Array.isArray(search?.results)) throw new SourceError(`B3 companies ${ticker}: no results in the answer.`);
  // The issuer's code is the ticker's four letters: PETR for PETR3 and PETR4.
  const company = search.results.find((c) => c?.issuingCompany === ticker.slice(0, 4));
  if (!company) return null;
  if (typeof company.codeCVM !== "string") throw new SourceError(`B3 companies ${ticker}: no CVM code in the answer.`);

  const detail = (await getJson(
    b3Url("listedCompaniesProxy/CompanyCall/GetDetail", { codeCVM: company.codeCVM, language: "pt-br" }),
    fetchFn,
  )) as { otherCodes?: { code?: unknown; isin?: unknown }[] | null } | null;
  if (!Array.isArray(detail?.otherCodes)) throw new SourceError(`B3 detail ${ticker}: no codes in the answer.`);
  const isin = detail.otherCodes.find((c) => c?.code === ticker)?.isin;
  return typeof isin === "string" && isin ? isin : null;
}

async function fundIsin(ticker: string, fetchFn: typeof fetch): Promise<string | null> {
  const supplement = await fundSupplement(ticker, fetchFn);
  if (supplement === null) return null;
  const rows = ["cashDividends", "stockDividends", "subscriptions"].flatMap((key) => {
    const list = supplement[key];
    return Array.isArray(list) ? (list as { isinCode?: unknown }[]) : [];
  });
  const isin = rows.map((r) => r?.isinCode).find((code) => typeof code === "string" && code.slice(6, 9) === "CTF");
  return (isin as string | undefined) ?? null;
}

/**
 * Every payout the B3 lists for the asset's ISIN, paid or only announced: a
 * company's from its supplement (`GetListedSupplementCompany`, by the issuer's
 * four letters), a fund's from the fund's. The ISIN tells PETR3's from PETR4's,
 * and a fund's quota from its subscription receipts. What isn't a payout, like
 * an amortization, and a row with no payment date yet are left out.
 */
export async function b3Payouts(asset: SourcedAsset, fetchFn: typeof fetch = fetch): Promise<AnnouncedPayout[]> {
  const isin = asset.sourceId;
  if (!isin) throw new SourceError(`B3 payouts ${asset.ticker}: the asset has no ISIN.`);
  const fund = asset.assetClass === "real-estate-funds";
  const supplement = fund ? await fundSupplement(asset.ticker, fetchFn) : await companySupplement(asset.ticker, fetchFn);
  if (supplement === null) return [];
  const rows = supplement.cashDividends;
  if (!Array.isArray(rows)) throw new SourceError(`B3 payouts ${asset.ticker}: no cash dividends in the answer.`);

  const payouts: AnnouncedPayout[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    if (row?.isinCode !== isin) continue;
    const kind = payoutKind(row.label, fund);
    if (!kind || row.paymentDate === "" || row.paymentDate === null) continue;
    const where = `B3 payouts ${asset.ticker}`;
    payouts.push({ kind, recordDate: dateFrom(row.lastDatePrior, where), paymentDate: dateFrom(row.paymentDate, where), perUnit: perUnitFrom(row.rate, where) });
  }
  return payouts;
}

/** The B3's labels of what is paid in cash per unit. A company's RENDIMENTO is its dividend's monetary update. */
function payoutKind(label: unknown, fund: boolean): PayoutKind | null {
  switch (label) {
    case "DIVIDENDO":
      return "dividend";
    case "JRS CAP PROPRIO":
      return "interest-on-equity";
    case "RENDIMENTO":
      return fund ? "fund-income" : "dividend";
    default:
      return null;
  }
}

/** A company's supplement, or null when the B3 answers nothing for its issuer. */
async function companySupplement(ticker: string, fetchFn: typeof fetch): Promise<Record<string, unknown> | null> {
  const answer = await getJson(
    b3Url("listedCompaniesProxy/CompanyCall/GetListedSupplementCompany", { issuingCompany: ticker.slice(0, 4), language: "pt-br" }),
    fetchFn,
  );
  if (answer === null) return null;
  // One company, in a list.
  if (!Array.isArray(answer)) throw new SourceError(`B3 company ${ticker}: the answer isn't a list.`);
  const company = answer[0] as unknown;
  if (company === undefined) return null;
  if (typeof company !== "object" || company === null) throw new SourceError(`B3 company ${ticker}: the answer isn't a company.`);
  return company as Record<string, unknown>;
}

/** A fund's supplement, or null when the B3 answers nothing for it. */
async function fundSupplement(ticker: string, fetchFn: typeof fetch): Promise<Record<string, unknown> | null> {
  const answer = await getJson(
    b3Url("fundsProxy/fundsCall/GetListedSupplementFunds", { cnpj: "0", identifierFund: ticker.slice(0, 4), typeFund: 7 }),
    fetchFn,
  );
  // An unknown fund comes back empty.
  if (answer === null) return null;
  if (typeof answer !== "object" || Array.isArray(answer)) throw new SourceError(`B3 fund ${ticker}: the answer isn't a fund.`);
  return answer as Record<string, unknown>;
}

/** The B3's "21/08/2026" as an ISO date; anything else is a format failure. */
function dateFrom(value: unknown, where: string): IsoDate {
  const m = typeof value === "string" ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value) : null;
  const date = m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  if (!isValidDate(date)) throw new SourceError(`${where}: "${String(value)}" isn't a date.`);
  return date;
}

/**
 * The B3's "0,47156696000" as an exact decimal, read from the text and rounded
 * to 8 places; anything else, or a value that rounds to nothing, is a format failure.
 */
function perUnitFrom(value: unknown, where: string): Decimal {
  const m = typeof value === "string" ? /^(\d+),(\d+)$/.exec(value) : null;
  const digits = m ? m[1]! + m[2]!.padEnd(DECIMAL_PLACES + 1, "0").slice(0, DECIMAL_PLACES + 1) : "0";
  const perUnit = Math.round(Number(digits) / 10);
  if (!Number.isSafeInteger(perUnit) || perUnit <= 0) throw new SourceError(`${where}: "${String(value)}" isn't a value per unit.`);
  return perUnit;
}
