import { z } from "zod";

const auditEventSchema = z.strictObject({
  session_id: z.uuid().nullable(),
  mandate_id: z.uuid().nullable(),
  actor: z.enum(["USER", "AGENT", "POLICY", "PAYMENT", "SYSTEM"]),
  event_type: z.enum([
    "MANDATE_RECEIVED",
    "MANDATE_REJECTED",
    "MANDATE_PARSED",
    "SEARCH_COMPLETED",
    "POLICY_DECISION",
    "PICK_PROPOSED",
    "NO_ELIGIBLE_PRODUCT",
    "AGENT_ERROR",
    "USER_APPROVED",
    "APPROVAL_BLOCKED",
    "USER_DECLINED",
    "ORDER_BLOCKED",
    "ORDER_CREATED",
    "ORDER_CAPTURED",
    "ORDER_FAILED",
    "WEBHOOK_RECEIVED",
  ]),
  decision: z.enum(["ALLOW", "BLOCK"]).nullable(),
  reason_codes: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
});

export type AuditRow = z.infer<typeof auditEventSchema> & { id: string };

export async function appendAuditEvent(
  insert: (row: AuditRow) => Promise<void>,
  event: unknown,
): Promise<void> {
  await insert({ ...auditEventSchema.parse(event), id: crypto.randomUUID() });
}
