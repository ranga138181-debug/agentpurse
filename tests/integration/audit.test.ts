import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

function event(session_id: string) {
  return {
    session_id,
    mandate_id: null,
    actor: "USER",
    event_type: "MANDATE_RECEIVED",
    decision: null,
    reason_codes: [],
    payload: {},
  };
}

test("IT-AUD-002 appended events carry the next seq and a server timestamp", async () => {
  const sessionId = crypto.randomUUID();
  const before = Date.now();

  await appendAuditEvent(insertAuditEvent, event(sessionId));
  await appendAuditEvent(insertAuditEvent, event(sessionId));

  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.session_id, sessionId))
    .orderBy(auditEvents.seq);
  expect(rows).toHaveLength(2);
  expect(rows[1].seq).toBeGreaterThan(rows[0].seq);
  expect(rows[0].ts.getTime()).toBeGreaterThan(before - 5000);
  expect(rows[0].ts.getTime()).toBeLessThan(Date.now() + 5000);
});
