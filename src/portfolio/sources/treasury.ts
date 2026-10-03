import { parseDecimal, type IsoDate } from "@/portfolio/domain";
import { isValidDate } from "@/shared";
import { SourceError, type TreasuryBondQuote } from "./port";

const CSV_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";

/** Stable stored ids in English; source labels remain Portuguese for display. */
const TYPE_IDS: Record<string, string> = {
  "Tesouro Selic": "selic",
  "Tesouro Prefixado": "fixed-rate",
  "Tesouro Prefixado com Juros Semestrais": "fixed-rate-semiannual-interest",
  "Tesouro IPCA+": "ipca-plus",
  "Tesouro IPCA+ com Juros Semestrais": "ipca-plus-semiannual-interest",
  "Tesouro IGPM+ com Juros Semestrais": "igpm-plus-semiannual-interest",
  "Tesouro Educa+": "education-plus",
  "Tesouro Renda+ Aposentadoria Extra": "retirement-plus",
};

/** The latest base date's entire list, shared by registration and quotes. */
export async function treasuryBonds(fetchFn: typeof fetch = fetch): Promise<TreasuryBondQuote[]> {
  try {
    const response = await fetchFn(CSV_URL, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new SourceError(`Treasury answered ${response.status}.`);
    const lines = (await response.text()).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    const headers = lines.shift()!.split(";");
    const columns = ["Tipo Titulo", "Data Vencimento", "Data Base", "PU Venda Manha"].map((name) => headers.indexOf(name));
    if (columns.includes(-1)) throw new SourceError("Treasury CSV columns changed.");
    const rows = lines.map((line) => line.split(";"));
    const dates = rows.map((values) => readDate(values[columns[2]!]));
    const latest = dates.reduce<IsoDate | null>((latest, date) => !latest || date > latest ? date : latest, null);
    if (!latest) throw new SourceError("Treasury CSV is empty.");
    // Historical rows can carry zero selling prices; only the latest list is quoted.
    return rows.filter((_, index) => dates[index] === latest).map((values) => {
      const [type, maturity, , price] = columns.map((column) => values[column]);
      const typeId = type && TYPE_IDS[type];
      if (!typeId) throw new SourceError("Invalid treasury bond type.");
      const maturityDate = readDate(maturity);
      const unitPrice = typeof price === "string" && /^\d+,\d{1,8}$/.test(price) ? parseDecimal(price) : null;
      if (unitPrice === null || unitPrice <= 0) throw new SourceError("Invalid treasury selling price.");
      return { name: `${type} ${maturityDate.slice(0, 4)}`, maturityDate, sourceId: `${typeId}|${maturityDate}`, price: unitPrice };
    });
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(`Treasury didn't answer: ${String(error)}`);
  }
}

function readDate(value: string | undefined): IsoDate {
  if (!value || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) throw new SourceError("Invalid treasury date.");
  const [day, month, year] = value.split("/");
  const date = `${year}-${month}-${day}`;
  if (!isValidDate(date)) throw new SourceError("Invalid treasury date.");
  return date as IsoDate;
}
