import type { IsoDate } from "@/portfolio/domain";
import { getJson, rateFrom } from "./http";
import { SourceError, type Ptax } from "./port";

// The BCB's Olinda OData service for the PTAX, with no key. CotacaoDolarPeriodo
// brings each day's closing PTAX, published around 13h on business days.

const API = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

/** How far back the last PTAX is looked for: longer than any run of days without one. */
const WINDOW_DAYS = 14;

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
