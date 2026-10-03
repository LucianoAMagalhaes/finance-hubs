import { parseDecimal, type IsoDate, type RateIndex } from "@/portfolio/domain";
import { formatDate, isValidDate } from "@/shared";
import { getJson, rateFrom } from "./http";
import { SourceError, type Ptax } from "./port";

// The BCB's Olinda OData service for the PTAX, with no key. CotacaoDolarPeriodo
// brings each day's closing PTAX, published around 13h on business days.

const API = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

/** How far back the last PTAX is looked for: longer than any run of days without one. */
const WINDOW_DAYS = 14;

/** The SGS series 12: daily CDI in percent, with both endpoints included. */
export async function bcbDailyCdi(from: IsoDate, to: IsoDate, fetchFn: typeof fetch = fetch): Promise<RateIndex[]> {
  if (!isValidDate(from) || !isValidDate(to)) throw new SourceError("BCB CDI: invalid date window.");
  const rates: RateIndex[] = [];
  for (let start = from; start <= to;) {
    const anniversary = new Date(`${start}T00:00:00Z`);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 10);
    anniversary.setUTCDate(anniversary.getUTCDate() - 1);
    const limit = anniversary.toISOString().slice(0, 10) as IsoDate;
    const end = limit < to ? limit : to;
    rates.push(...await cdiWindow(start, end, fetchFn));
    start = daysBefore(end, -1);
  }
  return rates;
}

/** Translates one SGS answer, rejecting a changed format as a source failure. */
async function cdiWindow(from: IsoDate, to: IsoDate, fetchFn: typeof fetch): Promise<RateIndex[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${formatDate(from)}&dataFinal=${formatDate(to)}`;
  const answer = await getJson(url, fetchFn);
  if (!Array.isArray(answer)) throw new SourceError("BCB CDI: no daily rates in the answer.");
  return answer.map((row): RateIndex => {
    const date = typeof row?.data === "string" && /^(\d{2})\/(\d{2})\/(\d{4})$/.test(row.data)
      ? `${row.data.slice(6)}-${row.data.slice(3, 5)}-${row.data.slice(0, 2)}` : "";
    const rate = typeof row?.valor === "string" && /^\d+(?:\.\d{1,8})?$/.test(row.valor) ? parseDecimal(row.valor.replace(".", ",")) : null;
    if (!isValidDate(date) || date < from || date > to || rate === null) throw new SourceError("BCB CDI: invalid daily rate in the answer.");
    return { kind: "cdi", date, rate };
  });
}

/**
 * The selling PTAX of the date or, on a day that has none, of the last day
 * before it that has one: asked over the two weeks up to the date, the last
 * one in the answer. None in the window is a failure too: there is nothing to suggest.
 */
export async function bcbSellingPtax(date: IsoDate, fetchFn: typeof fetch = fetch): Promise<Ptax> {
  const url =
    `${API}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${bcbDate(daysBefore(date, WINDOW_DAYS))}'&@dataFinalCotacao='${bcbDate(date)}'` +
    `&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
  const answer = (await getJson(url, fetchFn)) as BcbPeriod;
  const days = answer?.value;
  if (!Array.isArray(days)) throw new SourceError(`BCB PTAX ${date}: no days in the answer.`);
  const last = days
    .filter((d) => typeof d?.dataHoraCotacao === "string" && d.dataHoraCotacao.slice(0, 10) <= date)
    .sort((a, b) => (a.dataHoraCotacao! < b.dataHoraCotacao! ? -1 : 1))
    .at(-1);
  if (!last) throw new SourceError(`BCB PTAX ${date}: no PTAX in the ${WINDOW_DAYS} days before.`);
  return { rate: rateFrom(last.cotacaoVenda, `BCB PTAX ${date}`), date: last.dataHoraCotacao!.slice(0, 10) as IsoDate };
}

/** The BCB's "MM-DD-YYYY". */
const bcbDate = (date: IsoDate) => `${date.slice(5, 7)}-${date.slice(8)}-${date.slice(0, 4)}`;

function daysBefore(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10) as IsoDate;
}

type BcbPeriod = { value?: { cotacaoVenda?: unknown; dataHoraCotacao?: string }[] } | null;
