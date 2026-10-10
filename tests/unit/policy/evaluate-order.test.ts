import { expect, test } from "vitest";
import { evaluateOrder } from "@/policy/evaluate-order";

const now = new Date("2026-11-02T17:00:00Z");
const minutesAgo = (minutes: number, extraMs = 0) =>
  new Date(now.getTime() - minutes * 60_000 - extraMs);

const mandate = {
  status: "APPROVED",
  approved_at: minutesAgo(5),
  max_total_cents: 4000,
  currency: "USD",
  deliver_by: "2026-11-06",
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
  estimated_delivery_date: "2026-11-04",
};

const captured = { status: "CAPTURED" };
const open = { status: "CREATED" };
const failed = { status: "FAILED" };

const block = (reason_codes: string[]) => ({
  decision: "BLOCK",
  reason_codes,
  primary_reason: reason_codes[0],
  policy_version: "1.0.0",
});

const allow = {
  decision: "ALLOW",
  reason_codes: [],
  primary_reason: null,
  policy_version: "1.0.0",
};

test("UT-POL-012 DT-O01 a captured order blocks with MANDATE_ALREADY_SETTLED before every other rule", () => {
  const worst = { ...mandate, status: "PROPOSED", approved_at: minutesAgo(60) };

  expect(evaluateOrder(mandate, candidate, [captured], now)).toEqual(
    block(["MANDATE_ALREADY_SETTLED"]),
  );
  expect(
    evaluateOrder(
      worst,
      { ...candidate, in_stock: false },
      [open, captured],
      now,
    ),
  ).toEqual(block(["MANDATE_ALREADY_SETTLED"]));
});

test.each([
  "PROPOSED",
  "DECLINED",
  "REJECTED",
  "FAILED",
  "NO_ELIGIBLE_PRODUCT",
  "SETTLED",
])(
  "UT-POL-012 DT-O02 a %s mandate blocks with MANDATE_NOT_APPROVED",
  (status) => {
    const stale = { ...mandate, status, approved_at: minutesAgo(60) };

    expect(
      evaluateOrder(stale, { ...candidate, in_stock: false }, [open], now),
    ).toEqual(block(["MANDATE_NOT_APPROVED"]));
  },
);

test("UT-POL-012 DT-O03 an approval older than 15 minutes blocks with APPROVAL_EXPIRED", () => {
  const expired = { ...mandate, approved_at: minutesAgo(15, 1) };

  expect(
    evaluateOrder(expired, { ...candidate, in_stock: false }, [open], now),
  ).toEqual(block(["APPROVAL_EXPIRED"]));
});

test("UT-POL-012 an approval exactly 15 minutes old is still valid", () => {
  expect(
    evaluateOrder(
      { ...mandate, approved_at: minutesAgo(15) },
      candidate,
      [],
      now,
    ),
  ).toEqual(allow);
});

test("UT-POL-012 an approved mandate without an approval time blocks with APPROVAL_EXPIRED", () => {
  expect(
    evaluateOrder({ ...mandate, approved_at: null }, candidate, [], now),
  ).toEqual(block(["APPROVAL_EXPIRED"]));
});

test("UT-POL-012 DT-O04 a candidate that fails the re-check blocks with its reason codes", () => {
  const changed = {
    ...candidate,
    price_cents: 9000,
    estimated_delivery_date: "2026-11-09",
  };

  expect(evaluateOrder(mandate, changed, [open], now)).toEqual(
    block(["OVER_BUDGET", "LATE_DELIVERY"]),
  );
});

test.each([
  ["budget", { max_total_cents: null }],
  ["currency", { currency: null }],
])("UT-POL-012 DT-O04 a mandate without a %s blocks", (_name, missing) => {
  expect(evaluateOrder({ ...mandate, ...missing }, candidate, [], now)).toEqual(
    block(["POLICY_BLOCKED"]),
  );
});

test("UT-POL-012 DT-O05 an open order blocks with ORDER_ALREADY_OPEN", () => {
  expect(evaluateOrder(mandate, candidate, [failed, open], now)).toEqual(
    block(["ORDER_ALREADY_OPEN"]),
  );
});

test("UT-POL-012 DT-O06 an approved mandate with a valid candidate and no open order is allowed", () => {
  expect(evaluateOrder(mandate, candidate, [], now)).toEqual(allow);
  expect(evaluateOrder(mandate, candidate, [failed, failed], now)).toEqual(
    allow,
  );
});

test("UT-POL-012 DT-O04 an approved mandate without a candidate blocks", () => {
  expect(evaluateOrder(mandate, null, [], now)).toEqual(
    block(["POLICY_BLOCKED"]),
  );
});
