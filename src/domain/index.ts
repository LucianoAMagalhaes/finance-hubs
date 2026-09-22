// The domain module: pure, no I/O, no DOM, no framework. Runs the same on the
// server and in the browser (ADR-0004). `today` always comes in as a parameter.
export {
  apply,
  monthBornBy,
  whatItCanBecome,
  whyNoInstallments,
  whyTooFewInstallments,
  prepaymentPreview,
  type Command,
  type PreviewCut,
  type Ending,
  type ExpenseShape,
  type WhatItCanBecome,
  type PrepaymentPreview,
  type Result,
} from "./commands";
export { centsToField, formatReais, reaisToCents, type Cents } from "./money";
export {
  isIncomeSource,
  INCOME_SOURCES,
  incomeSourceName,
  type Income,
  type IncomeToSave,
  type IncomeSource,
  type NewIncome,
} from "./incomes";
export { allExpenses, groups, isJarGroup, axisName, AXES, type Axis, type Group } from "./axes";
export { findPrepayment, purchases, emptyState, type State } from "./state";
export {
  prepaymentsOf,
  splitIntoInstallments,
  startOf,
  installmentMonth,
  periodIn,
  periodsWithEnd,
  type Prepayment,
  type PrepaymentToSave,
  type Purchase,
  type Cut,
  type Expense,
  type ExpenseToSave,
  type NewExpense,
  type Occurrence,
  type Recurring,
  type RecurringToCreate,
  type Period,
  type PeriodToSave,
} from "./expenses";
export {
  proposedDate,
  monthsBetween,
  isValidDate,
  isValidMonth,
  monthOf,
  sameDayIn,
  monthName,
  addMonths,
  lastDayOfMonth,
  type IsoDate,
  type Month,
} from "./month";
export {
  isIncomeMethod,
  isPaymentMethod,
  paymentMethodName,
  INCOME_METHODS,
  PAYMENT_METHODS,
  type IncomeMethod,
  type PaymentMethod,
} from "./payment-methods";
export { trashItems, type TrashItem, type RecordType } from "./trash";
export {
  isJar,
  jarName,
  DEFAULT_PERCENTAGES,
  JARS,
  sumPercentages,
  validatePercentages,
  type Percentages,
  type Jar,
} from "./jars";
export {
  projectMonth,
  type MonthAggregates,
  type Unallocated,
  type BudgetInView,
  type JarGroup,
  type Verdict,
  type MonthView,
} from "./projection";
export { mergeOnRename, renamePreview, tagHue, normalizeTag, tagsInUse, type RenamePreview } from "./tags";
