import { decimal, parseDecimal, type IsoDate, type RateIndex } from "@/portfolio/domain";
import { formatDate, isValidDate } from "@/shared";
import { getJson, rateFrom } from "./http";
import { SourceError, type Ptax } from "./port";

// The BCB's Olinda OData service for the PTAX, with no key. CotacaoDolarPeriodo
// brings each day's closing PTAX, published around 13h on business days.

const API = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

/** How far back the last PTAX is looked for: longer than any run of days without one. */
const WINDOW_DAYS = 14;

/** SGS series 433, monthly percent; the included endpoints are month starts. */
export async function bcbMonthlyIpca(from: IsoDate, to: IsoDate, fetchFn: typeof fetch = fetch): Promise<RateIndex[]> {
  if (!isValidDate(from) || !isValidDate(to) || !from.endsWith("-01") || !to.endsWith("-01") || from > to) {
    throw new SourceError("BCB IPCA: invalid month window.");
  }
  const lastDay = new Date(`${to}T00:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${formatDate(from)}&dataFinal=${formatDate(lastDay.toISOString().slice(0, 10) as IsoDate)}`;
  const answer = await getJson(url, fetchFn);
  if (!Array.isArray(answer)) throw new SourceError("BCB IPCA: no monthly rates in the answer.");
  return answer.map((row): RateIndex => {
    const date = typeof row?.data === "string" && /^01\/\d{2}\/\d{4}$/.test(row.data)
      ? `${row.data.slice(6)}-${row.data.slice(3, 5)}-01` : "";
    const text = typeof row?.valor === "string" && /^-?\d+(?:\.\d{1,8})?$/.test(row.valor) ? row.valor : "";
    const magnitude = parseDecimal(text.replace("-", "").replace(".", ","));
    const rate = magnitude === null ? null : (text.startsWith("-") ? -magnitude : magnitude);
    if (!isValidDate(date) || date < from || date > to || rate === null || rate <= decimal(-100)) throw new SourceError("BCB IPCA: invalid monthly rate in the answer.");
    return { kind: "ipca", date, rate };
  });
}

/** Latest monthly Focus median (all respondents, base 0), only for the requested months. */
export async function bcbIpcaProjections(months: IsoDate[], fetchFn: typeof fetch = fetch): Promise<RateIndex[]> {
  return (await Promise.all(months.map(async (month): Promise<RateIndex[]> => {
    if (!isValidDate(month) || !month.endsWith("-01")) throw new SourceError("BCB Focus: invalid month.");
    const reference = `${month.slice(5, 7)}/${month.slice(0, 4)}`;
    const query = new URLSearchParams({
      $format: "json", $top: "1", $orderby: "Data desc",
      $filter: `Indicador eq 'IPCA' and baseCalculo eq 0 and DataReferencia eq '${reference}'`,
    });
    const answer = await getJson(`https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativaMercadoMensais?${query}`, fetchFn) as { value?: unknown[] } | null;
    if (!Array.isArray(answer?.value)) throw new SourceError("BCB Focus: no monthly medians in the answer.");
    const rows = answer.value as { Indicador?: unknown; baseCalculo?: unknown; DataReferencia?: unknown; Data?: unknown; Mediana?: unknown }[];
    for (const row of rows) {
      if (row?.Indicador !== "IPCA" || row.baseCalculo !== 0 || row.DataReferencia !== reference || typeof row.Data !== "string" || !isValidDate(row.Data) ||
        typeof row.Mediana !== "number" || !Number.isFinite(row.Mediana) || !Number.isSafeInteger(decimal(row.Mediana)) || row.Mediana <= -100) {
        throw new SourceError("BCB Focus: invalid monthly median in the answer.");
      }
    }
    const latest = rows.sort((a, b) => String(b.Data).localeCompare(String(a.Data)))[0];
    return latest ? [{ kind: "ipca-projection", date: month, rate: decimal(latest.Mediana as number) }] : [];
  }))).flat();
}

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
