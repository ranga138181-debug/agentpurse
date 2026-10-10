import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import type { AuditRow } from "./writer";

export async function insertAuditEvent(row: AuditRow): Promise<void> {
  await db.insert(auditEvents).values(row);
}
