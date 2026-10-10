import { expect, test } from "vitest";
import {
  GENESIS_HASH,
  computeHash,
  verifyChain,
  type ChainedEvent,
  type HashedFields,
} from "@/audit/hash-chain";

function event(seq: number): HashedFields {
  return {
    seq,
    id: `00000000-0000-4000-8000-0000000000${seq}`,
    ts: new Date(`2026-11-02T17:00:${seq}.123Z`),
    session_id: "7b0c1d5e-2f4a-4c6b-8d9e-0a1b2c3d4e5f",
    mandate_id: "9d0c1d5e-2f4a-4c6b-8d9e-0a1b2c3d4e5f",
    actor: "POLICY",
    event_type: "POLICY_DECISION",
    decision: "BLOCK",
    reason_codes: ["OVER_BUDGET", "LATE_DELIVERY"],
    payload: { product_id: "P-003", total_cents: 4100, nested: { rank: seq } },
  };
}

function chain(seqs = [10, 20, 30, 40]): ChainedEvent[] {
  let prev_hash = GENESIS_HASH;
  return seqs.map((seq) => {
    const hash = computeHash(prev_hash, event(seq));
    const chained = { ...event(seq), prev_hash, hash };
    prev_hash = hash;
    return chained;
  });
}

test("UT-AUD-002 an untampered chain verifies", () => {
  expect(verifyChain(chain())).toBeNull();
  expect(verifyChain(chain().reverse())).toBeNull();
  expect(verifyChain([])).toBeNull();
});

test("UT-AUD-002 the first event is chained from 64 zeros and each hash is a SHA-256 hex digest", () => {
  const [first, second] = chain();

  expect(first.prev_hash).toBe("0".repeat(64));
  expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(second.prev_hash).toBe(first.hash);
});

const alterations: [string, Partial<ChainedEvent>][] = [
  ["id", { id: "00000000-0000-4000-8000-000000000099" }],
  ["ts", { ts: new Date("2026-11-02T17:00:20.124Z") }],
  ["session_id", { session_id: null }],
  ["mandate_id", { mandate_id: "9d0c1d5e-2f4a-4c6b-8d9e-000000000000" }],
  ["actor", { actor: "USER" }],
  ["event_type", { event_type: "USER_APPROVED" }],
  ["decision", { decision: "ALLOW" }],
  ["reason_codes", { reason_codes: ["OVER_BUDGET"] }],
  ["reason code order", { reason_codes: ["LATE_DELIVERY", "OVER_BUDGET"] }],
  ["payload", { payload: { product_id: "P-003", total_cents: 4000 } }],
  [
    "a nested payload value",
    {
      payload: { product_id: "P-003", total_cents: 4100, nested: { rank: 1 } },
    },
  ],
  ["hash", { hash: "f".repeat(64) }],
  ["prev_hash", { prev_hash: "f".repeat(64) }],
];

test.each(alterations)(
  "UT-AUD-002 altering the stored %s of an event fails verification at that event",
  (_field, change) => {
    const events = chain();
    events[1] = { ...events[1], ...change };

    expect(verifyChain(events)).toBe(20);
  },
);

test("UT-AUD-002 altering an event's seq fails verification at that event", () => {
  const events = chain();
  events[1] = { ...events[1], seq: 25 };

  expect(verifyChain(events)).toBe(25);
});

test("UT-AUD-002 a removed or inserted event fails verification at the next event", () => {
  const events = chain();
  const forged = { ...event(15), prev_hash: events[0].hash, hash: "" };
  forged.hash = computeHash(forged.prev_hash as string, forged);

  expect(verifyChain(events.filter((e) => e.seq !== 20))).toBe(30);
  expect(verifyChain([...events, forged])).toBe(20);
});

test("UT-AUD-002 a chain that does not start from 64 zeros fails at its first event", () => {
  expect(verifyChain(chain().slice(1))).toBe(20);
});

test("UT-AUD-002 the hash does not depend on payload key order", () => {
  const a = {
    ...event(10),
    payload: { a: 1, b: { c: 2, d: [3, { e: 4, f: 5 }] } },
  };
  const b = {
    ...event(10),
    payload: { b: { d: [3, { f: 5, e: 4 }], c: 2 }, a: 1 },
  };

  expect(computeHash(GENESIS_HASH, a)).toBe(computeHash(GENESIS_HASH, b));
});
