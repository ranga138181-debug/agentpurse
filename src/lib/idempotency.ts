import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { idempotencyKeys } from "@/db/schema";
import { errorResponse } from "./errors";

const RECORD_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface IdempotentRequest {
  sessionId: string;
  endpoint: string;
  key: string;
  body: Record<string, unknown>;
  requestId: string;
  now: Date;
}

export async function idempotent(
  { sessionId, endpoint, key, body, requestId, now }: IdempotentRequest,
  handler: () => Promise<Response>,
): Promise<Response> {
  const canonicalBody = JSON.stringify(body, Object.keys(body).sort());
  const request_hash = createHash("sha256").update(canonicalBody).digest("hex");
  const record = and(
    eq(idempotencyKeys.session_id, sessionId),
    eq(idempotencyKeys.endpoint, endpoint),
    eq(idempotencyKeys.key, key),
  );
  const fresh = {
    request_hash,
    state: "IN_PROGRESS",
    response_status: null,
    response_body: null,
    created_at: now,
  };

  const claimed =
    (
      await db
        .insert(idempotencyKeys)
        .values({ session_id: sessionId, endpoint, key, ...fresh })
        .onConflictDoNothing()
        .returning()
    ).length > 0 ||
    // A record older than 24 hours is treated as a new key.
    (
      await db
        .update(idempotencyKeys)
        .set(fresh)
        .where(
          and(
            record,
            lt(
              idempotencyKeys.created_at,
              new Date(now.getTime() - RECORD_LIFETIME_MS),
            ),
          ),
        )
        .returning()
    ).length > 0;

  if (!claimed) {
    const [existing] = await db.select().from(idempotencyKeys).where(record);
    if (existing?.request_hash !== request_hash) {
      return errorResponse(
        422,
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was used with a different request",
        requestId,
      );
    }
    if (existing.state !== "COMPLETED") {
      return errorResponse(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "A request with this Idempotency-Key is still being processed",
        requestId,
      );
    }
    return Response.json(existing.response_body, {
      status: existing.response_status as number,
      headers: { "Idempotent-Replay": "true" },
    });
  }

  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    await db.delete(idempotencyKeys).where(record);
    throw error;
  }
  if (response.status >= 500) {
    // The client may retry with the same key; PayPal-Request-Id makes the upstream retry safe.
    await db.delete(idempotencyKeys).where(record);
  } else {
    await db
      .update(idempotencyKeys)
      .set({
        state: "COMPLETED",
        response_status: response.status,
        response_body: await response.clone().json(),
      })
      .where(record);
  }
  return response;
}
