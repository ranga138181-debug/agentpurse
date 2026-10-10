import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { sessionRoute } from "@/lib/session-route";
import { validate } from "@/lib/validate";

const querySchema = z.strictObject({
  after_seq: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  mandate_id: z.uuid().optional(),
});

export const GET = sessionRoute(
  "/api/audit",
  async (request, { requestId, sessionId }) => {
    const query = validate(
      querySchema,
      Object.fromEntries(new URL(request.url).searchParams),
      requestId,
    );
    if (query instanceof Response) return query;
    const events = await db
      .select({
        seq: auditEvents.seq,
        id: auditEvents.id,
        ts: auditEvents.ts,
        mandate_id: auditEvents.mandate_id,
        actor: auditEvents.actor,
        event_type: auditEvents.event_type,
        decision: auditEvents.decision,
        reason_codes: auditEvents.reason_codes,
        payload: auditEvents.payload,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.session_id, sessionId),
          gt(auditEvents.seq, query.after_seq),
          query.mandate_id
            ? eq(auditEvents.mandate_id, query.mandate_id)
            : undefined,
        ),
      )
      .orderBy(auditEvents.seq)
      .limit(query.limit);
    return Response.json({
      events,
      next_after_seq: events.at(-1)?.seq ?? query.after_seq,
    });
  },
);
