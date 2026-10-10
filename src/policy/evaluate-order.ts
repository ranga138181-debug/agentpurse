import { decide, type Decision } from "./decision";
import { evaluateCandidate, type Candidate } from "./evaluate-candidate";

const APPROVAL_VALID_MS = 15 * 60 * 1000;

export interface OrderMandate {
  status: string;
  approved_at: Date | null;
  max_total_cents: number | null;
  currency: string | null;
  deliver_by: string | null;
  exclude_terms: string[];
}

export function evaluateOrder(
  mandate: OrderMandate,
  candidate: Candidate,
  orders: { status: string }[],
  now: Date,
): Decision {
  const { status, approved_at, max_total_cents, currency } = mandate;
  if (orders.some((order) => order.status === "CAPTURED")) {
    return decide(["MANDATE_ALREADY_SETTLED"]);
  }
  if (status !== "APPROVED") return decide(["MANDATE_NOT_APPROVED"]);
  if (
    approved_at === null ||
    now.getTime() - approved_at.getTime() > APPROVAL_VALID_MS
  ) {
    return decide(["APPROVAL_EXPIRED"]);
  }
  // An approved mandate always has a budget; without one nothing can be checked, so it blocks.
  if (max_total_cents === null || currency === null) {
    return decide(["POLICY_BLOCKED"]);
  }
  const recheck = evaluateCandidate(
    { ...mandate, max_total_cents, currency },
    candidate,
  );
  if (recheck.decision === "BLOCK") return decide(recheck.reason_codes);
  if (orders.some((order) => order.status === "CREATED")) {
    return decide(["ORDER_ALREADY_OPEN"]);
  }
  return decide([]);
}
