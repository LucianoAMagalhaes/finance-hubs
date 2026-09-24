// PROTOTYPE (#71), throwaway: made-up in-memory data for the portfolio dashboard variants.
// Nothing here is the real model; it only feeds the layouts with plausible numbers and every
// edge the map decided (zero position, sold out, no score, no quote, matured, dollar assets).

export type ClassId = "domestic-stocks" | "international-stocks" | "fixed-income" | "real-estate-funds" | "crypto";

export const CLASSES: { id: ClassId; name: string; target: number }[] = [
  { id: "domestic-stocks", name: "Ações Nacionais", target: 25 },
  { id: "international-stocks", name: "Ações Internacionais", target: 15 },
  { id: "fixed-income", name: "Renda Fixa", target: 45 },
  { id: "real-estate-funds", name: "FIIs", target: 10 },
  { id: "crypto", name: "Cripto", target: 5 },
];

export const USD_RATE = 5.42;
export const QUOTES_AT = "hoje, 14:32";

type RawAsset = {
  ticker: string;
  detail?: string;
  cls: ClassId;
  qty: number;
  avg: number; // in the asset's currency
  avgBrl?: number; // dollar assets only
  price: number | null; // last quote, in the asset's currency
  score: number | null;
  realized?: number;
  payouts?: number;
  matured?: boolean;
};

const RAW: RawAsset[] = [
  { ticker: "ITSA4", cls: "domestic-stocks", qty: 800, avg: 9.1, price: 10.35, score: 7, payouts: 540 },
  { ticker: "BBAS3", cls: "domestic-stocks", qty: 300, avg: 25.06, price: 27.12, score: 5, realized: 152, payouts: 690 },
  { ticker: "WEGE3", cls: "domestic-stocks", qty: 60, avg: 38.5, price: 52.4, score: 9, payouts: 45 },
  { ticker: "TAEE11", cls: "domestic-stocks", qty: 0, avg: 0, price: 34.2, score: 6 },
  { ticker: "PETR4", cls: "domestic-stocks", qty: 0, avg: 0, price: 36.8, score: -1, realized: 820, payouts: 410 },
  { ticker: "VOO", cls: "international-stocks", qty: 4, avg: 410, avgBrl: 2120, price: 548.3, score: 8 },
  { ticker: "AAPL", cls: "international-stocks", qty: 6, avg: 172, avgBrl: 880, price: 231.5, score: 4 },
  { ticker: "MSFT", cls: "international-stocks", qty: 0, avg: 0, price: 438.1, score: null },
  { ticker: "Tesouro IPCA+ 2035", cls: "fixed-income", qty: 12.4, avg: 2980, price: 3215.4, score: 8 },
  { ticker: "Tesouro Selic 2029", cls: "fixed-income", qty: 3.2, avg: 15200, price: 16420.1, score: 6 },
  { ticker: "CDB Inter 2028", detail: "110% do CDI", cls: "fixed-income", qty: 20000, avg: 1, price: 1.1834, score: 7 },
  { ticker: "LCI Caixa 2026", detail: "IPCA + 5,2%", cls: "fixed-income", qty: 15000, avg: 1, price: 1.221, score: 5, matured: true },
  { ticker: "HGLG11", cls: "real-estate-funds", qty: 40, avg: 158, price: 162.9, score: 5, payouts: 1240 },
  { ticker: "KNRI11", cls: "real-estate-funds", qty: 35, avg: 140, price: 146.2, score: 3, payouts: 880 },
  { ticker: "MXRF11", cls: "real-estate-funds", qty: 500, avg: 10.1, price: 9.62, score: null, payouts: 610 },
  { ticker: "BTC", cls: "crypto", qty: 0.042, avg: 280000, price: 612000, score: 6 },
  { ticker: "ETH", cls: "crypto", qty: 0.8, avg: 12000, price: null, score: 4 },
];

export type Asset = RawAsset & {
  usd: boolean;
  cost: number; // R$
  costUsd: number | null;
  value: number; // R$
  valueUsd: number | null;
  unrealized: number; // R$
  totalGain: number; // R$
  totalGainUsd: number | null;
  gainPct: number | null;
  flags: string[];
};

function derive(a: RawAsset): Asset {
  const usd = a.cls === "international-stocks";
  const cost = a.qty * (usd ? a.avgBrl! : a.avg);
  const costUsd = usd ? a.qty * a.avg : null;
  const valueUsd = usd ? (a.price == null ? costUsd : a.qty * a.price) : null;
  const value = a.price == null ? cost : a.qty * a.price * (usd ? USD_RATE : 1);
  const unrealized = value - cost;
  const totalGain = unrealized + (a.realized ?? 0) + (a.payouts ?? 0);
  const flags: string[] = [];
  if (a.price == null) flags.push("sem cotação");
  if (a.score == null) flags.push("sem nota");
  else if (a.score <= 0) flags.push("nota ≤ 0");
  if (a.matured) flags.push("vencido");
  return {
    ...a,
    usd,
    cost,
    costUsd,
    value,
    valueUsd,
    unrealized,
    totalGain,
    totalGainUsd: usd ? valueUsd! - costUsd! : null,
    gainPct: cost > 0 ? totalGain / cost : null,
    flags,
  };
}

export const ASSETS: Asset[] = RAW.map(derive);

const total = ASSETS.reduce((s, a) => s + a.value, 0);
const totalCost = ASSETS.reduce((s, a) => s + a.cost, 0);

export const PORTFOLIO = {
  value: total,
  cost: totalCost,
  totalGain: ASSETS.reduce((s, a) => s + a.totalGain, 0),
  payouts: ASSETS.reduce((s, a) => s + (a.payouts ?? 0), 0),
};

export type ClassView = (typeof CLASSES)[number] & {
  assets: Asset[];
  value: number;
  share: number; // 0..100
  gap: number; // R$ to reach target (negative = above)
  totalGain: number;
};

export const CLASS_VIEWS: ClassView[] = CLASSES.map((c) => {
  const assets = ASSETS.filter((a) => a.cls === c.id).sort((x, y) => y.value - x.value);
  const value = assets.reduce((s, a) => s + a.value, 0);
  return {
    ...c,
    assets,
    value,
    share: (value / total) * 100,
    gap: (c.target / 100) * total - value,
    totalGain: assets.reduce((s, a) => s + a.totalGain, 0),
  };
});

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const usdFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
export const reais = (n: number) => brl.format(n);
export const dollars = (n: number) => usdFmt.format(n).replace("US$", "US$ ");
export const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + brl.format(Math.abs(n));
export const signedUsd = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + dollars(Math.abs(n));
export const pct = (n: number, digits = 1) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
export const qty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
export const price = (a: Asset, n: number | null) => (n == null ? "—" : a.usd ? dollars(n) : reais(n));
export const gainClass = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "");

// ---- trades and payouts per asset, made up to agree with qty/avg/realized/payouts above ----

export type TradeRow = { date: string; kind: "buy" | "sell"; qty: number; price: number; fx?: number };
export type PayoutRow = { date: string; kind: string; amount: number };

const SPECIAL: Record<string, TradeRow[]> = {
  PETR4: [
    { date: "2025-03-12", kind: "buy", qty: 200, price: 29.9 },
    { date: "2026-02-20", kind: "sell", qty: 200, price: 34.0 },
  ],
  "CDB Inter 2028": [{ date: "2024-06-03", kind: "buy", qty: 20000, price: 1 }],
  "LCI Caixa 2026": [{ date: "2024-01-15", kind: "buy", qty: 15000, price: 1 }],
  BBAS3: [
    { date: "2024-08-05", kind: "buy", qty: 200, price: 23.9 },
    { date: "2025-05-14", kind: "buy", qty: 150, price: 26.6 },
    { date: "2026-01-09", kind: "sell", qty: 50, price: 28.1 },
  ],
};

const DATES = ["2024-04-10", "2025-02-18", "2025-11-03"];

function makeTrades(a: Asset): TradeRow[] {
  if (SPECIAL[a.ticker]) return SPECIAL[a.ticker]!;
  if (a.qty === 0) return [];
  const fx = a.usd ? a.avgBrl! / a.avg : undefined;
  // two buys around the average price that average out to it exactly
  const half = a.qty / 2;
  return [
    { date: DATES[0]!, kind: "buy", qty: half, price: a.avg * 0.93, fx },
    { date: DATES[1]!, kind: "buy", qty: half, price: a.avg * 1.07, fx },
  ];
}

function makePayouts(a: Asset): PayoutRow[] {
  const total = a.payouts ?? 0;
  if (total === 0) return [];
  const kind = a.cls === "real-estate-funds" ? "Rendimento" : "Dividendo";
  return [
    { date: "2026-03-15", kind, amount: total * 0.3 },
    { date: "2026-06-15", kind: a.cls === "domestic-stocks" ? "JCP" : kind, amount: total * 0.33 },
    { date: "2026-09-15", kind, amount: total * 0.37 },
  ];
}

export const TRADES: Record<string, TradeRow[]> = Object.fromEntries(ASSETS.map((a) => [a.ticker, makeTrades(a)]));
export const PAYOUTS: Record<string, PayoutRow[]> = Object.fromEntries(ASSETS.map((a) => [a.ticker, makePayouts(a)]));
export const isPrivateBond = (a: Asset) => a.detail != null;
export const date = (iso: string) => iso.split("-").reverse().join("/");
