import type { Cents, IsoDate, Result } from "@/shared";
import type { PortfolioState } from "./state";
import { projectPortfolio, type AssetTag, type AssetView } from "./projection";
import type { AssetClass } from "./classes";
import { decimal, type Decimal } from "./decimal";
import type { BondKind } from "./bonds";
import type { ExchangeRate } from "./exchangeRate";

export type ContributionAsset = {
  id: number;
  ticker: string;
  score: number | null;
  currentValue: Cents;
  price: Cents | null;
  currency: AssetView["currency"];
  exchangeRate: ExchangeRate | null;
  bondKind: BondKind | null;
  quantity: Decimal | null;
  quantityLimited: boolean;
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
  unallocated: Cents;
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

/** A pure query of buyable units and applications, in reais, on the supplied state and date. */
export function suggestContribution(state: PortfolioState, contribution: Cents, today: IsoDate): Result<ContributionSuggestion> {
  const error = validateContribution(contribution);
  if (error) return { ok: false, error };
  const view = projectPortfolio(state, today);
  const classes: ContributionClass[] = view.classes.map(c => ({
    key: c.key, name: c.name, target: c.target, currentValue: c.value,
    shortfall: Math.max(0, c.target / 100 * (view.currentValue + contribution) - c.value),
    amount: 0, unallocated: 0,
    assets: c.assets.map(a => ({
      id: a.id, ticker: a.ticker, score: a.score, currentValue: a.currentValue, price: a.contributionPrice, currency: a.currency,
      exchangeRate: a.currency === "USD" ? (view.exchangeRate?.rate ?? null) : null,
      quantityLimited: false, bondKind: a.bond?.kind ?? null, quantity: a.bond?.kind === "private-bond" ? null : 0,
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
    buyUnits(c, assets);
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


/** Convert cents to exact scaled units, reserving whole cents for commercial steps. */
function buyUnits(c: ContributionClass, assets: ContributionAsset[]): void {
  const scale = BigInt(decimal(1));
  const denominator = scale * 1_000_000n * 10000n;
  const price = (a: ContributionAsset) => BigInt(Math.round(a.price! * 1_000_000)) * BigInt(a.exchangeRate ?? 10000);
  const cost = (a: ContributionAsset, quantity: Decimal) => Number((BigInt(quantity) * price(a) + denominator - 1n) / denominator);
  const step = (a: ContributionAsset) => a.bondKind === "treasury-bond" ? decimal(0.01)
    : c.key === "domestic-stocks" || c.key === "real-estate-funds" ? decimal(1) : null;
  const budget = c.amount;
  for (const a of assets) {
    if (a.bondKind === "private-bond") continue;
    const unitStep = step(a) ?? 1;
    const units = BigInt(a.amount) * denominator / (price(a) * BigInt(unitStep));
    const maxUnits = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / unitStep));
    a.quantityLimited = units > maxUnits || (step(a) === null && units === 0n && a.amount > 0);
    a.quantity = Number(units < maxUnits ? units : maxUnits) * unitStep;
    // Fractions retain their allocation in reais; no commercial step is invented.
    if (step(a) !== null || a.quantity === 0 || a.quantityLimited) a.amount = cost(a, a.quantity);
  }
  let remaining = budget - assets.reduce((sum, a) => sum + a.amount, 0);
  while (remaining > 0) {
    const candidates = assets.filter(a => {
      const unitStep = step(a);
      return unitStep !== null && Number.isSafeInteger(a.quantity! + unitStep)
        && cost(a, a.quantity! + unitStep) - a.amount <= remaining;
    });
    // Equally priced, balanced recipients repeat the same stable cycle.
    const cycleCost = candidates[0] && price(candidates[0]) * BigInt(step(candidates[0])!);
    if (cycleCost && cycleCost % denominator === 0n) {
      const cents = Number(cycleCost / denominator);
      const shortfalls = candidates.map(a => a.shortfall - a.amount);
      if (cents > 0 && Math.max(...shortfalls) - Math.min(...shortfalls) < cents
        && candidates.every(a => price(a) * BigInt(step(a)!) === cycleCost)) {
        const cycles = Math.min(Math.floor(remaining / cents / candidates.length),
          ...candidates.map(a => Math.floor((Number.MAX_SAFE_INTEGER - a.quantity!) / step(a)!)));
        if (cycles > 0) {
          for (const a of candidates) {
            a.quantity! += cycles * step(a)!;
            a.amount += cycles * cents;
          }
          remaining -= cycles * cents * candidates.length;
          continue;
        }
      }
    }
    let chosen: ContributionAsset | undefined;
    for (const a of candidates) {
      if (!chosen || a.shortfall - a.amount > chosen.shortfall - chosen.amount) chosen = a;
    }
    if (!chosen) break;
    const unitStep = step(chosen)!;
    const stepPrice = price(chosen) * BigInt(unitStep);
    const capacity = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / unitStep));
    let units = BigInt(chosen.amount + remaining) * denominator / stepPrice;
    if (units > capacity) units = capacity;
    // Batch consecutive choices only while no other affordable asset can take priority.
    for (const a of candidates) {
      if (a === chosen) continue;
      const threshold = chosen.shortfall - (a.shortfall - a.amount);
      const lastCost = assets.indexOf(chosen) < assets.indexOf(a) ? Math.floor(threshold) : Math.ceil(threshold) - 1;
      const untilPriorityChanges = BigInt(Math.max(0, lastCost)) * denominator / stepPrice + 1n;
      if (units > untilPriorityChanges) units = untilPriorityChanges;
    }
    const previousAmount = chosen.amount;
    chosen.quantity = Number(units) * unitStep;
    chosen.amount = cost(chosen, chosen.quantity);
    chosen.quantityLimited ||= units === capacity;
    remaining -= chosen.amount - previousAmount;
  }
  for (const a of assets) {
    const unitStep = step(a);
    if (unitStep !== null && !Number.isSafeInteger(a.quantity! + unitStep)) a.quantityLimited = true;
  }
  c.unallocated = remaining;
  c.amount = budget - remaining;
}
