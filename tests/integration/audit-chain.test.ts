import { asc, eq, isNotNull } from "drizzle-orm";
import { expect, test } from "vitest";
import { verifyChain } from "@/audit/hash-chain";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

const chained = () =>
  db
    .select()
    .from(auditEvents)
    .where(isNotNull(auditEvents.hash))
    .orderBy(asc(auditEvents.seq));

function append(session_id: string, rank: number) {
  return appendAuditEvent(insertAuditEvent, {
    session_id,
    mandate_id: null,
    actor: "POLICY",
    event_type: "POLICY_DECISION",
    decision: "BLOCK",
    reason_codes: ["OVER_BUDGET"],
    payload: { product_id: "P-003", total_cents: 4100, rank },
  });
}

test("UT-AUD-002 stored events are chained and the stored chain verifies", async () => {
  const sessionId = crypto.randomUUID();
  await append(sessionId, 1);
  await append(sessionId, 2);

  const [first, second] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.session_id, sessionId))
    .orderBy(asc(auditEvents.seq));

  expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(second.prev_hash).toBe(first.hash);
  expect(verifyChain(await chained())).toBeNull();
});

test("UT-AUD-002 concurrent appends keep seq order and chain order the same", async () => {
  const sessionId = crypto.randomUUID();

  await Promise.all(
    Array.from({ length: 12 }, (_, index) => append(sessionId, index)),
  );

  const mine = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.session_id, sessionId));
  expect(mine).toHaveLength(12);
  expect(verifyChain(await chained())).toBeNull();
});

test("UT-AUD-002 a stored event that differs from its hash is reported by seq", async () => {
  const sessionId = crypto.randomUUID();
  await append(sessionId, 1);
  const events = await chained();
  const target = events.at(-1)!;

  const tampered = events.map((event) =>
    event.seq === target.seq ? { ...event, decision: "ALLOW" } : event,
  );

  expect(verifyChain(tampered)).toBe(target.seq);
});
