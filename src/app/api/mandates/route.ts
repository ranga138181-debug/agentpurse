import { createModelAdapter } from "@/agent/model";
import { mandateRequestSchema } from "@/agent/schemas";
import { createFixtureSearch } from "@/agent/search/fixture";
import { config } from "@/lib/config";
import { sessionRoute } from "@/lib/session-route";
import { validate } from "@/lib/validate";
import { submitMandate } from "./pipeline";

export const POST = sessionRoute(
  "/api/mandates",
  async (request, { requestId, sessionId }) => {
    const body = validate(
      mandateRequestSchema,
      await request.json().catch(() => undefined),
      requestId,
    );
    if (body instanceof Response) return body;
    return submitMandate(
      { ...body, sessionId, now: new Date(), requestId },
      {
        adapter: createModelAdapter(config.AI_PROVIDER),
        searchProvider: config.SEARCH_PROVIDER,
        createSearch: createFixtureSearch,
      },
    );
  },
);
