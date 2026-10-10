import { expect, test, vi } from "vitest";
import { appendAuditEvent } from "@/audit/writer";

const event = {
  session_id: "7b0c1d5e-2f4a-4c6b-8d9e-0a1b2c3d4e5f",
  mandate_id: null,
  actor: "POLICY",
  event_type: "POLICY_DECISION",
  decision: "BLOCK",
  reason_codes: ["OVER_BUDGET"],
  payload: { product_id: "P-003", total_cents: 4100 },
};

test("UT-AUD-001 inserts a valid event with a generated id and the given fields", async () => {
  const insert = vi.fn().mockResolvedValue(undefined);

  await appendAuditEvent(insert, event);

  expect(insert).toHaveBeenCalledTimes(1);
  const row = insert.mock.calls[0][0];
  expect(row).toEqual({
    ...event,
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
});

test.each([
  ["event type", { event_type: "PRICE_CHANGED" }],
  ["actor", { actor: "MODEL" }],
  ["decision", { decision: "MAYBE" }],
])(
  "UT-AUD-001 rejects an %s outside the enumeration and inserts nothing",
  async (_name, override) => {
    const insert = vi.fn().mockResolvedValue(undefined);

    await expect(
      appendAuditEvent(insert, { ...event, ...override }),
    ).rejects.toThrow();

    expect(insert).not.toHaveBeenCalled();
  },
);

test("UT-AUD-001 rejects an event with an unknown field and inserts nothing", async () => {
  const insert = vi.fn().mockResolvedValue(undefined);

  await expect(
    appendAuditEvent(insert, { ...event, seq: 1 }),
  ).rejects.toThrow();

  expect(insert).not.toHaveBeenCalled();
});
