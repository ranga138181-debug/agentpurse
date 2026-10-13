import { expect, test } from "vitest";
import { addEntries } from "@/components/passbook";

let seq = 0;
const event = (
  event_type: string,
  payload: Record<string, unknown> = {},
  rest: { decision?: string; reason_codes?: string[] } = {},
) => ({
  seq: ++seq,
  event_type,
  decision: rest.decision ?? null,
  reason_codes: rest.reason_codes ?? [],
  payload,
});

test("UT-PASS-001 notable events map to their wording, reason and amount", () => {
  const entries = addEntries(
    [],
    [
      event("PICK_PROPOSED", { title: "Silk Scarf", total_cents: 3800 }),
      event(
        "POLICY_DECISION",
        { title: "Pearl Necklace", total_cents: 12900 },
        { decision: "BLOCK", reason_codes: ["OVER_BUDGET", "LATE_DELIVERY"] },
      ),
      event("USER_APPROVED", { title: "Silk Scarf", total_cents: 3800 }),
      event("ORDER_CREATED", { paypal_order_id: "5AB", total_cents: 3800 }),
      event("ORDER_CAPTURED"),
    ],
  );

  expect(
    entries.map(({ label, detail, amountCents, tone }) => ({
      label,
      detail,
      amountCents,
      tone,
    })),
  ).toEqual([
    { label: "Paid with PayPal", tone: "allow" },
    {
      label: "PayPal order created",
      detail: "5AB",
      amountCents: 3800,
      tone: "info",
    },
    { label: "You approved Silk Scarf", amountCents: 3800, tone: "allow" },
    {
      label: "Blocked Pearl Necklace",
      detail: "The total is over your budget.",
      amountCents: 12900,
      tone: "block",
    },
    { label: "Agent proposed Silk Scarf", amountCents: 3800, tone: "info" },
  ]);
});

test("UT-PASS-001 blocks, rejections and declines are worded plainly", () => {
  const entries = addEntries(
    [],
    [
      event("USER_DECLINED"),
      event("APPROVAL_BLOCKED", { title: "X", total_cents: 19900 }),
      event("ORDER_BLOCKED"),
      event("MANDATE_REJECTED", {}, { reason_codes: ["BUDGET_MISSING"] }),
    ],
  );

  expect(entries.map(({ label }) => label)).toEqual([
    "Mandate rejected",
    "Blocked by policy",
    "Blocked by policy",
    "You declined",
  ]);
  expect(entries[0].detail).toContain("No budget found");
  expect(entries[0].tone).toBe("block");
  expect(entries[1].amountCents).toBeUndefined();
  expect(entries[2].amountCents).toBe(19900);
});

test("UT-PASS-001 other events and allowed decisions are skipped", () => {
  const entries = addEntries(
    [],
    [
      event("MANDATE_RECEIVED"),
      event("MANDATE_PARSED"),
      event("SEARCH_COMPLETED"),
      event("POLICY_DECISION", { title: "Mug" }, { decision: "ALLOW" }),
      event("AGENT_ERROR"),
      event("WEBHOOK_RECEIVED"),
    ],
  );

  expect(entries).toEqual([]);
});

test("UT-PASS-001 entries are newest first, at most six, and batches accumulate", () => {
  const first = addEntries(
    [],
    [1, 2, 3, 4].map((n) => event("PICK_PROPOSED", { title: `A${n}` })),
  );
  const second = addEntries(
    first,
    [5, 6, 7].map((n) => event("PICK_PROPOSED", { title: `A${n}` })),
  );

  expect(first).toHaveLength(4);
  expect(second.map(({ label }) => label)).toEqual([
    "Agent proposed A7",
    "Agent proposed A6",
    "Agent proposed A5",
    "Agent proposed A4",
    "Agent proposed A3",
    "Agent proposed A2",
  ]);
  expect(new Set(second.map((entry) => entry.seq)).size).toBe(6);
});

test("UT-PASS-001 a missing title falls back to a generic name", () => {
  const [entry] = addEntries([], [event("PICK_PROPOSED", { title: null })]);

  expect(entry.label).toBe("Agent proposed a product");
});
