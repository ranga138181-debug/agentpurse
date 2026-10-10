import { decide, type Decision } from "./decision";
import type { BudgetExtraction } from "./extract-budget";

const MAX_BUDGET_CENTS = 50000;
const MAX_DEADLINE_DAYS = 60;

export function validateBudget(extraction: BudgetExtraction): Decision {
  if (typeof extraction === "string") return decide([extraction]);
  if (extraction.currency !== "USD") return decide(["UNSUPPORTED_CURRENCY"]);
  if (extraction.cents <= 0) return decide(["BUDGET_NOT_POSITIVE"]);
  if (extraction.cents > MAX_BUDGET_CENTS) {
    return decide(["BUDGET_EXCEEDS_CAP"]);
  }
  return decide([]);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function validateDeadline(
  deliverBy: string | null,
  today: string,
): Decision {
  if (deliverBy === null) return decide([]);
  if (deliverBy < today) return decide(["DEADLINE_IN_PAST"]);
  if (deliverBy > addDays(today, MAX_DEADLINE_DAYS)) {
    return decide(["DEADLINE_TOO_FAR"]);
  }
  return decide([]);
}
