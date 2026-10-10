import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { sessionRoute } from "@/lib/session-route";
import { validate } from "@/lib/validate";
import { readMandate } from "../read";

const paramsSchema = z.strictObject({ id: z.uuid() });

export const GET = sessionRoute<{ params: Promise<{ id: string }> }>(
  "/api/mandates/{id}",
  async (_request, { requestId, sessionId }, { params }) => {
    const input = validate(paramsSchema, await params, requestId);
    if (input instanceof Response) return input;
    const mandate = await readMandate(sessionId, input.id);
    return mandate
      ? Response.json(mandate)
      : errorResponse(404, "NOT_FOUND", "Mandate not found", requestId);
  },
);
