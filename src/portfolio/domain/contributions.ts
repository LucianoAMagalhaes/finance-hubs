import type { Cents, IsoDate, Result } from "@/shared";
import type { PortfolioState } from "./state";
import { projectPortfolio, type AssetTag, type AssetView } from "./projection";
import type { AssetClass } from "./classes";
import type { ExchangeRate } from "./exchangeRate";

export type ContributionAsset = {
  id: number;
  ticker: string;
  score: number | null;
  currentValue: Cents;
  price: Cents | null;
  currency: AssetView["currency"];
  exchangeRate: ExchangeRate | null;
  exclusions: AssetTag[];
  idealWeight: number | null;
  shortfall: Cents;
  amount: Cents;
};
export type ContributionClass = {
  key: AssetClass;
  name: string;
  target: number;
  currentValue: Cents;
  shortfall: Cents;
  amount: Cents;
  assets: ContributionAsset[];
};

export type ContributionSuggestion = {
  contribution: Cents;
  distributed: Cents;
  unallocated: Cents;
  classes: ContributionClass[];
};

export function validateContribution(contribution: Cents): string | null {
  return Number.isSafeInteger(contribution) && contribution > 0
    ? null
    : "Informe um aporte em reais com centavos, maior que zero e dentro do valor suportado.";
}

/** A pure query in reais, in cents, on the state and date supplied by the caller. */
export function suggestContribution(state: PortfolioState, contribution: Cents, today: IsoDate): Result<ContributionSuggestion> {
  const error = validateContribution(contribution);
  if (error) return { ok: false, error };
  const view = projectPortfolio(state, today);
  const classes: ContributionClass[] = view.classes.map(c => ({
    key: c.key, name: c.name, target: c.target, currentValue: c.value,
    shortfall: Math.max(0, c.target / 100 * (view.currentValue + contribution) - c.value),
    amount: 0,
    assets: c.assets.map(a => ({
      id: a.id, ticker: a.ticker, score: a.score, currentValue: a.currentValue, price: a.contributionPrice, currency: a.currency,
      exchangeRate: a.currency === "USD" ? (view.exchangeRate?.rate ?? null) : null,
      exclusions: a.tags.filter(t => t !== "zero-position"), idealWeight: null, shortfall: 0, amount: 0,
    })),
  }));
  const eligible = classes.filter(c => c.target > 0 && c.assets.some(a => a.exclusions.length === 0));
  const classAmounts = distribute(contribution, eligible.map(c => c.shortfall), { capAtShortfall: true });
  for (const [index, c] of eligible.entries()) {
    c.amount = classAmounts[index]!;
    const assets = c.assets.filter(a => a.exclusions.length === 0);
    const scores = assets.reduce((sum, a) => sum + a.score!, 0);
    const total = assets.reduce((sum, a) => sum + a.currentValue, c.amount);
    for (const a of assets) {
      a.idealWeight = a.score! / scores;
      a.shortfall = Math.max(0, a.idealWeight * total - a.currentValue);
    }
    const assetAmounts = distribute(c.amount, assets.map(a => a.shortfall), { capAtShortfall: false });
    for (const [index, a] of assets.entries()) a.amount = assetAmounts[index]!;
  }
  const distributed = classes.reduce((sum, c) => sum + c.amount, 0);
  return { ok: true, value: { contribution, distributed, unallocated: contribution - distributed, classes } };
}

/** Largest remainders keep rows in whole cents; ties retain the snapshot's stable order. */
function distribute(budget: Cents, shortfalls: Cents[], { capAtShortfall }: { capAtShortfall: boolean }): Cents[] {
  const total = shortfalls.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return shortfalls.map(() => 0);
  const available = capAtShortfall ? Math.min(budget, Math.floor(total)) : budget;
  const shares = shortfalls.map(value => available * (value / total));
  const amounts = shares.map(Math.floor);
  let remaining = available - amounts.reduce((sum, value) => sum + value, 0);
  const order = shares.map((share, index) => ({ index, fraction: share - amounts[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remaining === 0) break;
    if (shortfalls[index]! > 0 && (!capAtShortfall || amounts[index]! + 1 <= shortfalls[index]!)) {
      amounts[index]! += 1;
      remaining--;
    }
  }
  return amounts;
}
