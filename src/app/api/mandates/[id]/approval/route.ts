import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { candidates, mandates } from "@/db/schema";
import { errorResponse } from "@/lib/errors";
import { sessionRoute } from "@/lib/session-route";
import { validate } from "@/lib/validate";
import { evaluateApproval } from "@/policy/evaluate-approval";
import { readMandate } from "../../read";

const paramsSchema = z.strictObject({ id: z.uuid() });
const bodySchema = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("APPROVE"), candidate_id: z.uuid() }),
  z.strictObject({ decision: z.literal("DECLINE") }),
]);

export const POST = sessionRoute<{ params: Promise<{ id: string }> }>(
  "/api/mandates/{id}/approval",
  async (request, { requestId, sessionId }, { params }) => {
    const input = validate(paramsSchema, await params, requestId);
    if (input instanceof Response) return input;
    const body = validate(
      bodySchema,
      await request.json().catch(() => undefined),
      requestId,
    );
    if (body instanceof Response) return body;
    const notFound = () =>
      errorResponse(404, "NOT_FOUND", "Not found", requestId);

    const [mandate] = await db
      .select()
      .from(mandates)
      .where(
        and(eq(mandates.id, input.id), eq(mandates.session_id, sessionId)),
      );
    if (!mandate) return notFound();

    const approving = body.decision === "APPROVE";
    const alreadyRecorded = approving
      ? mandate.status === "APPROVED" &&
        mandate.approved_candidate_id === body.candidate_id
      : mandate.status === "DECLINED";
    if (alreadyRecorded) {
      return Response.json(await readMandate(sessionId, mandate.id));
    }

    const audit = (actor: string, event_type: string, extra: object) =>
      appendAuditEvent(insertAuditEvent, {
        session_id: sessionId,
        mandate_id: mandate.id,
        actor,
        event_type,
        decision: null,
        reason_codes: [],
        payload: {},
        ...extra,
      });
    const candidate = approving
      ? ((
          await db
            .select()
            .from(candidates)
            .where(eq(candidates.id, body.candidate_id))
        )[0] ?? null)
      : undefined;
    const summary = candidate && {
      product_id: candidate.product_id,
      title: candidate.title,
      total_cents: candidate.total_cents,
      rank: candidate.rank,
    };

    const { decision, reason_codes, primary_reason } = evaluateApproval(
      mandate,
      candidate,
    );
    if (decision === "BLOCK") {
      if (primary_reason === "MANDATE_NOT_PROPOSED") {
        return errorResponse(
          409,
          "INVALID_STATE",
          "The mandate is not awaiting approval",
          requestId,
          { reason: primary_reason },
        );
      }
      if (primary_reason === "NOT_FOUND") return notFound();
      await audit("POLICY", "APPROVAL_BLOCKED", {
        decision: "BLOCK",
        reason_codes,
        payload: summary,
      });
      return errorResponse(
        409,
        "POLICY_BLOCKED",
        "The policy engine blocked this candidate",
        requestId,
        { reason_codes },
      );
    }

    await db
      .update(mandates)
      .set(
        approving
          ? {
              status: "APPROVED",
              approved_candidate_id: body.candidate_id,
              approved_at: new Date(),
            }
          : { status: "DECLINED" },
      )
      .where(eq(mandates.id, mandate.id));
    await (approving
      ? audit("USER", "USER_APPROVED", { decision: "ALLOW", payload: summary })
      : audit("USER", "USER_DECLINED", {}));
    return Response.json(await readMandate(sessionId, mandate.id));
  },
);
