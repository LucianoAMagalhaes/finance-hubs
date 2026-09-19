/** Um mês-calendário, "AAAA-MM". Compara em ordem de tempo como string. */
export type Mes = `${number}-${number}`;

/** Uma data, "AAAA-MM-DD". */
export type Data = `${number}-${number}-${number}`;

const NOMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function partes(mes: Mes): [ano: number, mes: number] {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  return [ano, m];
}

function deIndice(indice: number): Mes {
  const ano = Math.floor(indice / 12);
  const m = indice - ano * 12 + 1;
  return `${ano}-${String(m).padStart(2, "0")}` as Mes;
}

/** Meses contados desde o ano zero: aritmética de mês vira aritmética de inteiro. */
function indice(mes: Mes): number {
  const [ano, m] = partes(mes);
  return ano * 12 + (m - 1);
}

export function somarMeses(mes: Mes, n: number): Mes {
  return deIndice(indice(mes) + n);
}

/** Quantos meses vão de `de` até `ate`; negativo se `ate` vem antes. */
export function distanciaEntreMeses(de: Mes, ate: Mes): number {
  return indice(ate) - indice(de);
}

export function ultimoDiaDoMes(mes: Mes): number {
  const [ano, m] = partes(mes);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

export function mesDaData(data: Data): Mes {
  return data.slice(0, 7) as Mes;
}

/** Se o texto é uma data "AAAA-MM-DD" que existe no calendário. */
export function ehDataValida(texto: string): texto is Data {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const [, , mes, dia] = m.map(Number) as [number, number, number, number];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= ultimoDiaDoMes(mesDaData(texto as Data));
}

/** A data que um formulário propõe: hoje no mês em curso, o dia 1 em qualquer outro mês. */
export function dataProposta(mes: Mes, hoje: Data): Data {
  return mesDaData(hoje) === mes ? hoje : (`${mes}-01` as Data);
}

export function nomeDoMes(mes: Mes): string {
  const [ano, m] = partes(mes);
  return `${NOMES[m - 1]} de ${ano}`;
}
