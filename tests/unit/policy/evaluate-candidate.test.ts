import { expect, test } from "vitest";
import {
  evaluateCandidate,
  type Candidate,
  type Constraints,
} from "@/policy/evaluate-candidate";

const constraints: Constraints = {
  max_total_cents: 4000,
  currency: "USD",
  deliver_by: "2026-11-06",
  exclude_terms: [],
};

const candidate: Candidate = {
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

const allow = (total_cents: number) => ({
  decision: "ALLOW",
  reason_codes: [],
  primary_reason: null,
  policy_version: "1.0.0",
  total_cents,
});

const block = (reason_codes: string[], total_cents: number | null) => ({
  decision: "BLOCK",
  reason_codes,
  primary_reason: reason_codes[0],
  policy_version: "1.0.0",
  total_cents,
});

const incomplete = block(["INCOMPLETE_PRODUCT_DATA"], null);

function evaluate(
  candidateOverride: Partial<Candidate> = {},
  constraintsOverride: Partial<Constraints> = {},
) {
  return evaluateCandidate(
    { ...constraints, ...constraintsOverride },
    { ...candidate, ...candidateOverride },
  );
}

test("UT-POL-011 DT-R08 a complete, in-budget, in-stock, on-time, permitted candidate is ALLOW", () => {
  expect(evaluate()).toEqual(allow(2998));
});

test.each([
  ["product_id null", { product_id: null }],
  ["product_id empty", { product_id: "" }],
  ["title null", { title: null }],
  ["title empty", { title: "" }],
  ["merchant null", { merchant: null }],
  ["merchant empty", { merchant: "" }],
  ["category null", { category: null }],
  ["category empty", { category: "" }],
  ["currency null", { currency: null }],
  ["currency empty", { currency: "" }],
  ["in_stock null", { in_stock: null }],
  ["price_cents null", { price_cents: null }],
  ["shipping_cents null", { shipping_cents: null }],
  ["tax_cents null", { tax_cents: null }],
  ["deadline set with null delivery", { estimated_delivery_date: null }],
] as [string, Partial<Candidate>][])(
  "UT-POL-003 R-01 blocks %s with INCOMPLETE_PRODUCT_DATA",
  (_name, override) => {
    expect(evaluate(override)).toEqual(incomplete);
  },
);

test("UT-POL-004 R-02 blocks a currency mismatch and skips R-03", () => {
  expect(evaluate({ currency: "EUR", price_cents: 99999 })).toEqual(
    block(["CURRENCY_MISMATCH"], 100498),
  );
});

test.each([
  ["under budget", { price_cents: 3000, shipping_cents: 0 }, allow(3000)],
  ["equal to budget", { price_cents: 4000, shipping_cents: 0 }, allow(4000)],
  [
    "one cent over",
    { price_cents: 4001, shipping_cents: 0 },
    block(["OVER_BUDGET"], 4001),
  ],
  [
    "shipping pushing over",
    { price_cents: 3600, shipping_cents: 500 },
    block(["OVER_BUDGET"], 4100),
  ],
  [
    "tax pushing over",
    { price_cents: 3999, shipping_cents: 0, tax_cents: 2 },
    block(["OVER_BUDGET"], 4001),
  ],
])("UT-POL-005 R-03 %s", (_name, override, expected) => {
  expect(evaluate(override)).toEqual(expected);
});

test("UT-POL-006 R-04 blocks an out-of-stock candidate", () => {
  expect(evaluate({ in_stock: false })).toEqual(block(["OUT_OF_STOCK"], 2998));
});

test.each([
  ["before the deadline", "2026-11-05", "2026-11-06", allow(2998)],
  ["on the deadline", "2026-11-06", "2026-11-06", allow(2998)],
  [
    "after the deadline",
    "2026-11-07",
    "2026-11-06",
    block(["LATE_DELIVERY"], 2998),
  ],
  [
    "after the deadline across a month end",
    "2026-12-01",
    "2026-11-30",
    block(["LATE_DELIVERY"], 2998),
  ],
  ["null deadline", "2027-01-01", null, allow(2998)],
])(
  "UT-POL-007 R-05 delivery %s",
  (_name, estimated_delivery_date, deliver_by, expected) => {
    expect(evaluate({ estimated_delivery_date }, { deliver_by })).toEqual(
      expected,
    );
  },
);

test.each(["alcohol", "tobacco", "weapons", "adult", "pharmacy", "gift_card"])(
  "UT-POL-008 R-06 blocks restricted category %s",
  (category) => {
    expect(evaluate({ category })).toEqual(
      block(["RESTRICTED_CATEGORY"], 2998),
    );
  },
);

test("UT-POL-008 R-06 allows a permitted category", () => {
  expect(evaluate({ category: "electronics" })).toEqual(allow(2998));
});

test.each([
  [
    "a term in a different case",
    { title: "Scented CANDLE Gift Set" },
    ["candle"],
  ],
  ["an upper-case term", {}, ["CANDLE"]],
  ["a term needing NFKC normalisation", {}, ["ｃａｎｄｌｅ"]],
  [
    "a title needing NFKC normalisation",
    { title: "Ｌｅａｔｈｅｒ Wallet" },
    ["leather"],
  ],
  [
    "a substring of a title word",
    { title: "Candlelight Dinner Set" },
    ["candle"],
  ],
  ["a term in the category", { category: "home" }, ["home"]],
  ["one matching term among several", {}, ["wine", "candle"]],
])("UT-POL-009 R-07 blocks %s", (_name, override, exclude_terms) => {
  expect(evaluate(override, { exclude_terms })).toEqual(
    block(["EXCLUDED_TERM"], 2998),
  );
});

test.each([
  ["no terms", []],
  ["terms that do not occur", ["leather", "wine"]],
  ["a plural term against a singular title", ["candles"]],
])("UT-POL-009 R-07 allows %s", (_name, exclude_terms) => {
  expect(evaluate({}, { exclude_terms })).toEqual(allow(2998));
});

const RULES = [
  ["CURRENCY_MISMATCH", { currency: "EUR" }, {}],
  ["OVER_BUDGET", { price_cents: 9000 }, {}],
  ["OUT_OF_STOCK", { in_stock: false }, {}],
  ["LATE_DELIVERY", { estimated_delivery_date: "2026-11-07" }, {}],
  ["RESTRICTED_CATEGORY", { category: "alcohol" }, {}],
  ["EXCLUDED_TERM", {}, { exclude_terms: ["candle"] }],
] as const;

const combinations = Array.from({ length: 64 }, (_, mask) =>
  RULES.map((_rule, index) => Boolean(mask & (1 << index))),
);

test.each(combinations)(
  "UT-POL-010 reason list for R-02 %s, R-03 %s, R-04 %s, R-05 %s, R-06 %s, R-07 %s failing",
  (...failing) => {
    const candidateOverride = Object.assign(
      {},
      ...RULES.map((rule, index) => (failing[index] ? rule[1] : {})),
    );
    const constraintsOverride = Object.assign(
      {},
      ...RULES.map((rule, index) => (failing[index] ? rule[2] : {})),
    );
    const expected = RULES.filter(
      (rule, index) =>
        failing[index] && !(rule[0] === "OVER_BUDGET" && failing[0]),
    ).map((rule) => rule[0]);

    const result = evaluate(candidateOverride, constraintsOverride);

    expect(result.reason_codes).toEqual(expected);
    expect(result.decision).toBe(expected.length === 0 ? "ALLOW" : "BLOCK");
    expect(result.primary_reason).toBe(expected[0] ?? null);
  },
);

test("UT-POL-010 R-01 short-circuits every other rule", () => {
  const result = evaluate(
    {
      price_cents: null,
      currency: "EUR",
      in_stock: false,
      category: "alcohol",
      estimated_delivery_date: "2026-11-07",
    },
    { exclude_terms: ["candle"] },
  );

  expect(result).toEqual(incomplete);
});

test.each([
  ["DT-R01", { title: null }, {}, "INCOMPLETE_PRODUCT_DATA"],
  ["DT-R02", { currency: "EUR" }, {}, "CURRENCY_MISMATCH"],
  ["DT-R03", { price_cents: 9000 }, {}, "OVER_BUDGET"],
  ["DT-R04", { in_stock: false }, {}, "OUT_OF_STOCK"],
  ["DT-R05", { estimated_delivery_date: "2026-11-07" }, {}, "LATE_DELIVERY"],
  ["DT-R06", { category: "tobacco" }, {}, "RESTRICTED_CATEGORY"],
  ["DT-R07", {}, { exclude_terms: ["candle"] }, "EXCLUDED_TERM"],
])(
  "UT-POL-011 %s is BLOCK with its primary reason",
  (_row, candidateOverride, constraintsOverride, reason) => {
    const result = evaluate(candidateOverride, constraintsOverride);

    expect(result.decision).toBe("BLOCK");
    expect(result.primary_reason).toBe(reason);
  },
);

test.each([
  [
    "DT-L01",
    { price_cents: 9000, estimated_delivery_date: "2026-11-07" },
    {},
    ["OVER_BUDGET", "LATE_DELIVERY"],
  ],
  [
    "DT-L02",
    { currency: "EUR", in_stock: false, category: "alcohol" },
    {},
    ["CURRENCY_MISMATCH", "OUT_OF_STOCK", "RESTRICTED_CATEGORY"],
  ],
  [
    "DT-L03",
    {
      price_cents: 9000,
      in_stock: false,
      estimated_delivery_date: "2026-11-07",
      category: "alcohol",
    },
    { exclude_terms: ["candle"] },
    [
      "OVER_BUDGET",
      "OUT_OF_STOCK",
      "LATE_DELIVERY",
      "RESTRICTED_CATEGORY",
      "EXCLUDED_TERM",
    ],
  ],
  [
    "DT-L04",
    { merchant: null, price_cents: 9000, in_stock: false },
    {},
    ["INCOMPLETE_PRODUCT_DATA"],
  ],
])(
  "UT-POL-011 %s lists every failing rule in order",
  (_row, candidateOverride, constraintsOverride, reasons) => {
    expect(
      evaluate(candidateOverride, constraintsOverride).reason_codes,
    ).toEqual(reasons);
  },
);

const flat = { shipping_cents: 0, tax_cents: 0 };

test.each([
  ["DT-B01", { ...flat, price_cents: 4000 }, {}, allow(4000)],
  ["DT-B02", { ...flat, price_cents: 4001 }, {}, block(["OVER_BUDGET"], 4001)],
  [
    "DT-B03",
    { price_cents: 3600, shipping_cents: 500 },
    {},
    block(["OVER_BUDGET"], 4100),
  ],
  [
    "DT-B04",
    { price_cents: 3999, shipping_cents: 0, tax_cents: 2 },
    {},
    block(["OVER_BUDGET"], 4001),
  ],
  ["DT-B05", { estimated_delivery_date: "2026-11-06" }, {}, allow(2998)],
  [
    "DT-B06",
    { estimated_delivery_date: "2026-11-07" },
    {},
    block(["LATE_DELIVERY"], 2998),
  ],
  [
    "DT-B07",
    { estimated_delivery_date: null },
    { deliver_by: null },
    allow(2998),
  ],
  ["DT-B08", { estimated_delivery_date: null }, {}, incomplete],
  ["DT-B09", { price_cents: null }, {}, incomplete],
  ["DT-B10", { price_cents: 29.99 }, {}, incomplete],
  ["DT-B11", { shipping_cents: -1 }, {}, incomplete],
  ["DT-B12", { ...flat, price_cents: 0 }, {}, allow(0)],
  [
    "DT-B13",
    { category: "gift_card" },
    {},
    block(["RESTRICTED_CATEGORY"], 2998),
  ],
  [
    "DT-B14",
    { title: "Leather Wallet" },
    { exclude_terms: ["leather"] },
    block(["EXCLUDED_TERM"], 2998),
  ],
  [
    "DT-B15",
    { title: "Vegan Cork Wallet" },
    { exclude_terms: ["leather"] },
    allow(2998),
  ],
  [
    "DT-B16",
    { title: "Scented CANDLE Gift Set" },
    { exclude_terms: ["candle"] },
    block(["EXCLUDED_TERM"], 2998),
  ],
  [
    "DT-B17",
    { ...flat, currency: "EUR", price_cents: 3000 },
    {},
    block(["CURRENCY_MISMATCH"], 3000),
  ],
] as [string, Partial<Candidate>, Partial<Constraints>, unknown][])(
  "UT-POL-011 %s boundary",
  (_row, candidateOverride, constraintsOverride, expected) => {
    expect(evaluate(candidateOverride, constraintsOverride)).toEqual(expected);
  },
);
