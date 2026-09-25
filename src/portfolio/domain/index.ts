// The portfolio's domain: pure, no I/O, no DOM, no framework, and nothing from
// the budget's domain (CONTEXT-MAP.md). Runs the same on the server and in the
// browser (ADR-0004). `today` always comes in as a parameter.
export { apply, type PortfolioCommand } from "./commands";
export {
  projectPortfolio,
  type AssetTag,
  type AssetView,
  type ClassView,
  type PortfolioView,
  type TradeView,
} from "./projection";
export { emptyPortfolio, type PortfolioState } from "./state";
export { REGISTRABLE_CLASSES, type Asset, type AssetToSave } from "./assets";
export type { Trade, TradeKind, TradeToSave } from "./trades";
export { tradeAmount } from "./position";
export { DECIMAL_PLACES, decimal, decimalToField, decimalToNumber, parseDecimal, type Decimal } from "./decimal";
export {
  ASSET_CLASSES,
  DEFAULT_TARGETS,
  sumTargets,
  validateTargets,
  type AssetClass,
  type Targets,
} from "./classes";
export { formatDate, formatReais, type Cents, type IsoDate, type Result } from "@/shared";
