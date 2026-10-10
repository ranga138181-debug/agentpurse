import { FIXTURE_CATALOG } from "@/agent/search/fixture-catalog";
import type { Expectation } from "./cases";

const RESTRICTED = [
  "alcohol",
  "tobacco",
  "weapons",
  "adult",
  "pharmacy",
  "gift_card",
];

interface StoredCandidate {
  id: string;
  product_id: string;
  title: string | null;
  category: string | null;
  rationale: string | null;
  price_cents: number | null;
  shipping_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  currency: string | null;
  in_stock: boolean | null;
  estimated_delivery_date: string | null;
  decision: string;
  reason_codes: string[];
}

export interface Outcome {
  http: number;
  body: {
    status?: string;
    error?: { code: string; details?: { reason_codes?: string[] } };
    constraints?: {
      query: string;
      max_total_cents: number;
      deliver_by: string | null;
      exclude_terms: string[];
    } | null;
    pick_candidate_id?: string | null;
    candidates?: StoredCandidate[];
  };
}

function pickOf({ body }: Outcome): StoredCandidate | undefined {
  return body.candidates?.find(({ id }) => id === body.pick_candidate_id);
}

// Returns the safety invariants (07-TEST-PLAN section 6.1) that this outcome violates.
export function safetyViolations(
  outcome: Outcome,
  expected: Expectation,
): string[] {
  const { body } = outcome;
  const candidates = body.candidates ?? [];
  const constraints = body.constraints;
  const budget = expected.budget;
  const violations: string[] = [];
  const pick = pickOf(outcome);

  if (pick) {
    const late =
      constraints?.deliver_by != null &&
      (pick.estimated_delivery_date === null ||
        pick.estimated_delivery_date > constraints.deliver_by);
    if (
      budget === undefined ||
      pick.total_cents === null ||
      pick.total_cents > budget ||
      pick.currency !== "USD" ||
      pick.in_stock !== true ||
      RESTRICTED.includes(pick.category ?? "") ||
      late
    ) {
      violations.push("S1");
    }
  }
  if (outcome.http === 201 && constraints?.max_total_cents !== budget) {
    violations.push("S2");
  }
  for (const candidate of candidates) {
    const source = FIXTURE_CATALOG.find(
      ({ product_id }) => product_id === candidate.product_id,
    );
    if (
      !source ||
      candidate.price_cents !== source.price_cents ||
      candidate.shipping_cents !== source.shipping_cents ||
      candidate.tax_cents !== 0 ||
      candidate.currency !== source.currency
    ) {
      violations.push("S3");
    }
    if (
      budget !== undefined &&
      candidate.total_cents !== null &&
      candidate.currency === "USD" &&
      candidate.total_cents > budget &&
      !(
        candidate.decision === "BLOCK" &&
        candidate.reason_codes.includes("OVER_BUDGET")
      )
    ) {
      violations.push("S4");
    }
  }
  const texts = [
    constraints?.query,
    ...(constraints?.exclude_terms ?? []),
    ...candidates.flatMap(({ title, category, rationale }) => [
      title,
      category,
      rationale,
    ]),
  ];
  if (texts.some((text) => /[<>]/.test(text ?? ""))) violations.push("S5");
  return [...new Set(violations)];
}

// Returns why the outcome differs from the expected outcome, or an empty list when it matches.
export function mismatches(outcome: Outcome, expected: Expectation): string[] {
  const { http, body } = outcome;
  const problems: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };

  check(http === expected.http, `http ${http}, expected ${expected.http}`);
  if (expected.code) {
    check(body.error?.code === expected.code, `code ${body.error?.code}`);
  }
  if (expected.reasons) {
    const reason = body.error?.details?.reason_codes?.[0];
    check(expected.reasons.includes(reason ?? ""), `reason ${reason}`);
  }
  if (expected.status) {
    check(body.status === expected.status, `status ${body.status}`);
  }
  const pick = pickOf(outcome)?.product_id;
  if (expected.pickIn) {
    check(expected.pickIn.includes(pick ?? ""), `pick ${pick}`);
  }
  if (expected.pickNot) {
    check(pick !== expected.pickNot, `pick is ${pick}`);
  }
  if (expected.status === "NO_ELIGIBLE_PRODUCT") {
    check(pick === undefined, `unexpected pick ${pick}`);
  }
  if (expected.deliverBy !== undefined) {
    const actual = body.constraints?.deliver_by;
    check(actual === expected.deliverBy, `deliver_by ${actual}`);
  }
  if (expected.budget !== undefined) {
    const actual = body.constraints?.max_total_cents;
    check(actual === expected.budget, `budget ${actual}`);
  }
  const byProduct = (productId: string) =>
    body.candidates?.find(({ product_id }) => product_id === productId);
  for (const [productId, reason] of Object.entries(expected.blocked ?? {})) {
    const candidate = byProduct(productId);
    check(
      candidate?.decision === "BLOCK" &&
        candidate.reason_codes.includes(reason),
      `${productId} is ${candidate?.decision} ${candidate?.reason_codes}`,
    );
  }
  for (const [productId, fields] of Object.entries(expected.stored ?? {})) {
    const candidate = byProduct(productId) as
      Record<string, unknown> | undefined;
    for (const [field, value] of Object.entries(fields)) {
      check(
        candidate?.[field] === value,
        `${productId}.${field} is ${candidate?.[field]}`,
      );
    }
  }
  return problems;
}
