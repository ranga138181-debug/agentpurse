import { desc, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { GENESIS_HASH, computeHash } from "./hash-chain";
import type { AuditRow } from "./writer";

const CHAIN_LOCK_ID = 7_011;

export async function insertAuditEvent(row: AuditRow): Promise<void> {
  await db.transaction(async (tx) => {
    // Inserts are serialised so that seq order and chain order always match.
    await tx.execute(sql`select pg_advisory_xact_lock(${CHAIN_LOCK_ID})`);
    const next = await tx.execute<{ seq: number; ts: Date }>(sql`
      select nextval(pg_get_serial_sequence('audit_events', 'seq'))::int as seq,
             date_trunc('milliseconds', clock_timestamp()) as ts`);
    const { seq, ts } = next.rows[0];
    const [last] = await tx
      .select({ hash: auditEvents.hash })
      .from(auditEvents)
      .where(isNotNull(auditEvents.hash))
      .orderBy(desc(auditEvents.seq))
      .limit(1);
    const prev_hash = last?.hash ?? GENESIS_HASH;
    const event = { ...row, seq, ts: new Date(ts) };
    await tx
      .insert(auditEvents)
      .values({ ...event, prev_hash, hash: computeHash(prev_hash, event) });
  });
}
