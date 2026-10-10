import { expect, test } from "vitest";
import { evaluateCapture } from "@/policy/evaluate-capture";

const order = {
  id: "order-1",
  status: "CREATED",
  amount_cents: 2998,
  currency: "USD",
};

const paypal = { status: "APPROVED", value: "29.98", currency_code: "USD" };
const self = { id: "order-1", status: "CREATED" };
const otherCaptured = { id: "order-2", status: "CAPTURED" };

const block = (reason: string) => ({
  decision: "BLOCK",
  reason_codes: [reason],
  primary_reason: reason,
  policy_version: "1.0.0",
});

const allow = {
  decision: "ALLOW",
  reason_codes: [],
  primary_reason: null,
  policy_version: "1.0.0",
};

test.each(["CAPTURED", "FAILED"])(
  "UT-POL-012 DT-C01 a %s order blocks with ORDER_NOT_CREATED before every other rule",
  (status) => {
    const wrong = { status: "CREATED", value: "1.00", currency_code: "EUR" };

    expect(
      evaluateCapture({ ...order, status }, wrong, [self, otherCaptured]),
    ).toEqual(block("ORDER_NOT_CREATED"));
  },
);

test("UT-POL-012 DT-C02 another captured order blocks with MANDATE_ALREADY_SETTLED", () => {
  const wrong = { status: "CREATED", value: "1.00", currency_code: "USD" };

  expect(evaluateCapture(order, wrong, [self, otherCaptured])).toEqual(
    block("MANDATE_ALREADY_SETTLED"),
  );
});

test.each([
  ["a higher amount", { value: "29.99" }],
  ["a lower amount", { value: "29.97" }],
  ["an amount a hundred times larger", { value: "2998" }],
  ["another currency", { currency_code: "EUR" }],
  ["a malformed amount", { value: "29.98 USD" }],
  ["an amount with three decimals", { value: "29.980" }],
  ["a negative amount", { value: "-29.98" }],
  ["an empty amount", { value: "" }],
])("UT-POL-012 DT-C03 %s blocks with AMOUNT_MISMATCH", (_name, change) => {
  const state = { ...paypal, status: "CREATED", ...change };

  expect(evaluateCapture(order, state, [self])).toEqual(
    block("AMOUNT_MISMATCH"),
  );
});

test.each(["CREATED", "PAYER_ACTION_REQUIRED", "COMPLETED", "VOIDED", "SAVED"])(
  "UT-POL-012 DT-C04 a PayPal status of %s blocks with PAYPAL_NOT_APPROVED",
  (status) => {
    expect(evaluateCapture(order, { ...paypal, status }, [self])).toEqual(
      block("PAYPAL_NOT_APPROVED"),
    );
  },
);

test("UT-POL-012 DT-C05 an approved PayPal order with a matching amount and currency is allowed", () => {
  expect(evaluateCapture(order, paypal, [self])).toEqual(allow);
  expect(
    evaluateCapture(order, paypal, [self, { id: "order-0", status: "FAILED" }]),
  ).toEqual(allow);
});

test.each([
  ["a whole-number amount", 3000, "30"],
  ["a one-decimal amount", 2990, "29.9"],
  ["a zero amount", 0, "0.00"],
  ["the largest budget", 50000, "500.00"],
])("UT-POL-012 %s converts to cents exactly", (_name, amount_cents, value) => {
  expect(
    evaluateCapture({ ...order, amount_cents }, { ...paypal, value }, [self]),
  ).toEqual(allow);
});
