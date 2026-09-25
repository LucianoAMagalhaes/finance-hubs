// Generic pieces shared by every context: pure, and knowing no term of any
// domain (no month, jar or asset). Contexts import from here, never from each other.
export { formatDate, isValidDate, type IsoDate } from "./date";
export { centsToField, formatReais, reaisToCents, type Cents } from "./money";
export type { Result } from "./result";
