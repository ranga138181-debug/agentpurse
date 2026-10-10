import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { candidates, mandates } from "@/db/schema";

export async function readMandate(sessionId: string, mandateId: string) {
  const [mandate] = await db
    .select()
    .from(mandates)
    .where(and(eq(mandates.id, mandateId), eq(mandates.session_id, sessionId)));
  if (!mandate) return null;
  const rows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.mandate_id, mandateId))
    .orderBy(candidates.rank);
  return {
    id: mandate.id,
    status: mandate.status,
    raw_text: mandate.raw_text,
    constraints:
      mandate.query === null
        ? null
        : {
            query: mandate.query,
            max_total_cents: mandate.max_total_cents,
            currency: mandate.currency,
            deliver_by: mandate.deliver_by,
            exclude_terms: mandate.exclude_terms,
          },
    reject_reasons: mandate.reject_reasons,
    pick_candidate_id: mandate.pick_candidate_id,
    approved_candidate_id: mandate.approved_candidate_id,
    approved_at: mandate.approved_at,
    candidates: rows.map((row) => ({ ...row, mandate_id: undefined })),
    order: null,
    created_at: mandate.created_at,
  };
}
