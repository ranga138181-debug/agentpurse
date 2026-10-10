import type { ApiError } from "./api";

const REASONS: Record<string, string> = {
  BUDGET_MISSING:
    'No budget found. Add an amount with a currency symbol, for example "max $40".',
  BUDGET_AMBIGUOUS:
    "More than one amount found. State a single budget for the whole purchase.",
  UNSUPPORTED_CURRENCY: "Only US dollar budgets are supported.",
  BUDGET_NOT_POSITIVE: "The budget must be more than $0.",
  BUDGET_EXCEEDS_CAP: "The budget cannot be more than $500.",
  DEADLINE_IN_PAST: "The delivery deadline is in the past.",
  DEADLINE_TOO_FAR: "The delivery deadline is more than 60 days away.",
};

const CODES: Record<string, string> = {
  VALIDATION_ERROR: "Enter a mandate of 1 to 500 characters.",
  RATE_LIMITED: "Too many requests. Wait a moment and try again.",
  DAILY_LIMIT_REACHED: "The demo has reached its daily limit. Try tomorrow.",
  AGENT_UNAVAILABLE: "The shopping agent is unavailable. Nothing was picked.",
  SEARCH_UNAVAILABLE: "Product search is unavailable. Nothing was picked.",
  AGENT_TIMEOUT: "The shopping agent took too long. Nothing was picked.",
  POLICY_BLOCKED: "The policy engine blocked this product.",
  APPROVAL_EXPIRED: "The approval expired. Approve a product again.",
  AMOUNT_MISMATCH:
    "The PayPal order did not match the approved total. No payment was taken.",
  PAYMENT_PROVIDER_ERROR: "PayPal could not complete the payment.",
};

export function errorMessage(error: ApiError): string {
  const reasons = (error.details?.reason_codes ?? [])
    .map((code) => REASONS[code])
    .filter(Boolean);
  return (
    reasons.join(" ") || CODES[error.code] || "Something went wrong. Try again."
  );
}
