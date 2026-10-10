import { expect, test } from "vitest";
import { evaluateCandidate } from "@/policy/evaluate-candidate";

const constraints = {
  max_total_cents: 4000,
  currency: "USD",
  deliver_by: null,
  exclude_terms: [],
};

const candidate = {
  product_id: "P-001",
  title: "Scented Candle Gift Set",
  merchant: "AgentPurse Demo Store",
  category: "home",
  currency: "USD",
  in_stock: true,
  price_cents: 2499,
  shipping_cents: 499,
  tax_cents: 0,
  estimated_delivery_date: null,
};

const fields = ["price_cents", "shipping_cents", "tax_cents"] as const;
const invalidAmounts = [29.99, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY];

test.each(
  fields.flatMap((field) => invalidAmounts.map((amount) => [field, amount])),
)(
  "UT-POL-014 %s of %s is BLOCK with INCOMPLETE_PRODUCT_DATA",
  (field, amount) => {
    const result = evaluateCandidate(constraints, {
      ...candidate,
      [field]: amount,
    });

    expect(result).toMatchObject({
      decision: "BLOCK",
      reason_codes: ["INCOMPLETE_PRODUCT_DATA"],
      total_cents: null,
    });
  },
);

test("UT-POL-014 a numeric string amount is BLOCK with INCOMPLETE_PRODUCT_DATA", () => {
  const result = evaluateCandidate(constraints, {
    ...candidate,
    price_cents: "2499" as unknown as number,
  });

  expect(result.reason_codes).toEqual(["INCOMPLETE_PRODUCT_DATA"]);
});

test("UT-POL-014 integer amounts sum to an integer total", () => {
  expect(evaluateCandidate(constraints, candidate).total_cents).toBe(2998);
});
