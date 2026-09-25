import { getJson } from "./http";
import { SourceError, type SourcedAsset } from "./port";

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
  const supplement = (await getJson(
    b3Url("fundsProxy/fundsCall/GetListedSupplementFunds", { cnpj: "0", identifierFund: ticker.slice(0, 4), typeFund: 7 }),
    fetchFn,
  )) as Record<string, { isinCode?: unknown }[] | unknown> | null;
  // An unknown fund comes back empty.
  if (supplement === null) return null;
  if (typeof supplement !== "object") throw new SourceError(`B3 fund ${ticker}: the answer isn't a fund.`);
  const rows = ["cashDividends", "stockDividends", "subscriptions"].flatMap((key) => {
    const list = supplement[key];
    return Array.isArray(list) ? (list as { isinCode?: unknown }[]) : [];
  });
  const isin = rows.map((r) => r?.isinCode).find((code) => typeof code === "string" && code.slice(6, 9) === "CTF");
  return (isin as string | undefined) ?? null;
}
