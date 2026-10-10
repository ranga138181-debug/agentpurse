import { config } from "./config";
import { errorResponse } from "./errors";
import { rateLimitsFor, retryAfterSeconds } from "./rate-limit";
import { route } from "./route";
import { resolveSession } from "./session";

type SessionHandler<C> = (
  request: Request,
  context: { requestId: string; sessionId: string },
  routeContext: C,
) => Promise<Response>;

export function sessionRoute<C = unknown>(
  name: string,
  handler: SessionHandler<C>,
): (request: Request, routeContext?: C) => Promise<Response> {
  return route<C>(name, async (request, requestId, routeContext) => {
    if (
      request.method === "POST" &&
      request.headers.get("origin") !== config.APP_URL
    ) {
      return errorResponse(
        403,
        "FORBIDDEN_ORIGIN",
        "Request origin is not allowed",
        requestId,
      );
    }
    const session = await resolveSession(request);
    // Render puts the client address first in the forwarded-for header.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    const retryAfter = retryAfterSeconds(
      rateLimitsFor(name, request.method, session.id, ip ?? "unknown"),
      Date.now(),
    );
    const response =
      retryAfter === null
        ? await handler(
            request,
            { requestId, sessionId: session.id },
            routeContext,
          )
        : errorResponse(
            429,
            "RATE_LIMITED",
            "Too many requests; try again shortly",
            requestId,
          );
    if (retryAfter !== null) {
      response.headers.set("Retry-After", String(retryAfter));
    }
    if (session.setCookie)
      response.headers.set("Set-Cookie", session.setCookie);
    return response;
  });
}
