import { config } from "./config";
import { errorResponse } from "./errors";
import { route } from "./route";
import { resolveSession } from "./session";

type SessionHandler = (
  request: Request,
  context: { requestId: string; sessionId: string },
) => Promise<Response>;

export function sessionRoute(
  name: string,
  handler: SessionHandler,
): (request: Request) => Promise<Response> {
  return route(name, async (request, requestId) => {
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
    const response = await handler(request, {
      requestId,
      sessionId: session.id,
    });
    if (session.setCookie)
      response.headers.set("Set-Cookie", session.setCookie);
    return response;
  });
}
