import { eq, sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

async function existingRow() {
  const sessionId = crypto.randomUUID();
  await appendAuditEvent(insertAuditEvent, {
    session_id: sessionId,
    mandate_id: null,
    actor: "USER",
    event_type: "MANDATE_RECEIVED",
    decision: null,
    reason_codes: [],
    payload: {},
  });
  const read = () =>
    db.select().from(auditEvents).where(eq(auditEvents.session_id, sessionId));
  return { sessionId, read, row: (await read())[0] };
}

test("IT-AUD-003 UPDATE on audit_events fails and the row is unchanged", async () => {
  const { sessionId, read, row } = await existingRow();

  await expect(
    db
      .update(auditEvents)
      .set({ decision: "ALLOW" })
      .where(eq(auditEvents.session_id, sessionId)),
  ).rejects.toThrow();

  expect(await read()).toEqual([row]);
});

test("IT-AUD-003 DELETE on audit_events fails and the row is unchanged", async () => {
  const { sessionId, read, row } = await existingRow();

  await expect(
    db.delete(auditEvents).where(eq(auditEvents.session_id, sessionId)),
  ).rejects.toThrow();

  expect(await read()).toEqual([row]);
});

test("IT-AUD-003 TRUNCATE on audit_events fails and the row is unchanged", async () => {
  const { read, row } = await existingRow();

  await expect(db.execute(sql`TRUNCATE audit_events`)).rejects.toThrow();

  expect(await read()).toEqual([row]);
});
