import { createModelAdapter } from "@/agent/model";
import { mandateRequestSchema } from "@/agent/schemas";
import { createFixtureSearch } from "@/agent/search/fixture";
import { config } from "@/lib/config";
import { createDeadline } from "@/lib/deadline";
import { sessionRoute } from "@/lib/session-route";
import { validate } from "@/lib/validate";
import { submitMandate } from "./pipeline";

const REQUEST_DEADLINE_MS = 12000;

export const POST = sessionRoute(
  "/api/mandates",
  async (request, { requestId, sessionId }) => {
    const deadline = createDeadline(REQUEST_DEADLINE_MS);
    const body = validate(
      mandateRequestSchema,
      await request.json().catch(() => undefined),
      requestId,
    );
    if (body instanceof Response) return body;
    return submitMandate(
      { ...body, sessionId, now: new Date(), requestId, deadline },
      {
        adapter: createModelAdapter(config),
        dailyCap: config.DAILY_MANDATE_CAP,
        searchProvider: config.SEARCH_PROVIDER,
        createSearch: createFixtureSearch,
      },
    );
  },
);
