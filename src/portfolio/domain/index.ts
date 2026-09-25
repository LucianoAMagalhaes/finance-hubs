// The portfolio's domain: pure, no I/O, no DOM, no framework, and nothing from
// the budget's domain (CONTEXT-MAP.md). Runs the same on the server and in the
// browser (ADR-0004). `today` always comes in as a parameter.
export { apply, type PortfolioCommand } from "./commands";
export { projectPortfolio, type ClassView, type PortfolioView } from "./projection";
export { emptyPortfolio, type PortfolioState } from "./state";
export {
  ASSET_CLASSES,
  DEFAULT_TARGETS,
  sumTargets,
  validateTargets,
  type AssetClass,
  type Targets,
} from "./classes";
export { formatReais, type Cents, type IsoDate, type Result } from "@/shared";
