import { config } from "./config";
import { errorResponse } from "./errors";
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
    const response = await handler(
      request,
      { requestId, sessionId: session.id },
      routeContext,
    );
    if (session.setCookie)
      response.headers.set("Set-Cookie", session.setCookie);
    return response;
  });
}
