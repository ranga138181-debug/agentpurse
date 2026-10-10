import { decide, type Decision } from "./decision";

export interface Constraints {
  max_total_cents: number;
  currency: string;
  deliver_by: string | null;
  exclude_terms: string[];
}

export interface Candidate {
  product_id: string | null;
  title: string | null;
  merchant: string | null;
  category: string | null;
  currency: string | null;
  in_stock: boolean | null;
  price_cents: number | null;
  shipping_cents: number | null;
  tax_cents: number | null;
  estimated_delivery_date: string | null;
}

export type CandidateDecision = Decision & { total_cents: number | null };

const RESTRICTED_CATEGORIES = [
  "alcohol",
  "tobacco",
  "weapons",
  "adult",
  "pharmacy",
  "gift_card",
];

function isCents(value: number | null): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function normalise(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function evaluateCandidate(
  constraints: Constraints,
  candidate: Candidate,
): CandidateDecision {
  const { product_id, title, merchant, category, currency, in_stock } =
    candidate;
  const { price_cents, shipping_cents, tax_cents, estimated_delivery_date } =
    candidate;
  if (
    !product_id ||
    !title ||
    !merchant ||
    !category ||
    !currency ||
    in_stock === null ||
    !isCents(price_cents) ||
    !isCents(shipping_cents) ||
    !isCents(tax_cents) ||
    (constraints.deliver_by !== null && estimated_delivery_date === null)
  ) {
    return { ...decide(["INCOMPLETE_PRODUCT_DATA"]), total_cents: null };
  }

  const total_cents = price_cents + shipping_cents + tax_cents;
  const currencyMismatch = currency !== constraints.currency;
  const searchable = normalise(`${title} ${category}`);
  // ISO dates compare correctly as strings, so no clock or Date is needed. R-01 guarantees the delivery date here.
  const late =
    constraints.deliver_by !== null &&
    (estimated_delivery_date as string) > constraints.deliver_by;
  const reasonCodes = [
    currencyMismatch && "CURRENCY_MISMATCH",
    !currencyMismatch &&
      total_cents > constraints.max_total_cents &&
      "OVER_BUDGET",
    !in_stock && "OUT_OF_STOCK",
    late && "LATE_DELIVERY",
    RESTRICTED_CATEGORIES.includes(category) && "RESTRICTED_CATEGORY",
    constraints.exclude_terms.some((term) =>
      searchable.includes(normalise(term)),
    ) && "EXCLUDED_TERM",
  ].filter((code) => code !== false);

  return { ...decide(reasonCodes), total_cents };
}
