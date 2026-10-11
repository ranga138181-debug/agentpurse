import { expect, test } from "vitest";
import { addEvents, EMPTY_IMPACT } from "@/components/impact";

const decision = (
  decision: string,
  reason_codes: string[],
  total_cents: number | null,
) => ({
  event_type: "POLICY_DECISION",
  decision,
  reason_codes,
  payload: { total_cents },
});

test("UT-IMP-001 a new session has no impact", () => {
  expect(EMPTY_IMPACT).toEqual({
    checked: 0,
    blocked: 0,
    stoppedCents: 0,
    settled: 0,
  });
});

test("UT-IMP-001 counts decisions, blocks, over-budget cents and captures", () => {
  const impact = addEvents(EMPTY_IMPACT, [
    decision("ALLOW", [], 4999),
    decision("BLOCK", ["OVER_BUDGET"], 19900),
    decision("BLOCK", ["OVER_BUDGET", "LATE_DELIVERY"], 4100),
    decision("BLOCK", ["OUT_OF_STOCK"], 2600),
    {
      event_type: "ORDER_CAPTURED",
      decision: null,
      reason_codes: [],
      payload: { total_cents: 4999 },
    },
  ]);

  expect(impact).toEqual({
    checked: 4,
    blocked: 3,
    stoppedCents: 24000,
    settled: 1,
  });
});

test("UT-IMP-001 other events and null totals add nothing", () => {
  const impact = addEvents(EMPTY_IMPACT, [
    decision("BLOCK", ["INCOMPLETE_PRODUCT_DATA"], null),
    {
      event_type: "APPROVAL_BLOCKED",
      decision: "BLOCK",
      reason_codes: ["OVER_BUDGET"],
      payload: { total_cents: 19900 },
    },
    {
      event_type: "MANDATE_RECEIVED",
      decision: null,
      reason_codes: [],
      payload: {},
    },
  ]);

  expect(impact).toEqual({
    checked: 1,
    blocked: 1,
    stoppedCents: 0,
    settled: 0,
  });
});

test("UT-IMP-001 batches accumulate without changing the earlier summary", () => {
  const first = addEvents(EMPTY_IMPACT, [decision("ALLOW", [], 100)]);
  const second = addEvents(first, [decision("BLOCK", ["OVER_BUDGET"], 900)]);

  expect(first.checked).toBe(1);
  expect(second).toEqual({
    checked: 2,
    blocked: 1,
    stoppedCents: 900,
    settled: 0,
  });
});
