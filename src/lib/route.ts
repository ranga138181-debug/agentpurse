import { log } from "./logger";

type Handler<C> = (
  request: Request,
  requestId: string,
  routeContext: C,
) => Promise<Response>;

export function route<C = unknown>(
  name: string,
  handler: Handler<C>,
): (request: Request, routeContext?: C) => Promise<Response> {
  return async (request, routeContext) => {
    const requestId = crypto.randomUUID();
    const start = performance.now();
    const response = await handler(request, requestId, routeContext as C);
    response.headers.set("X-Request-Id", requestId);
    log("info", "request", {
      request_id: requestId,
      route: name,
      method: request.method,
      status: response.status,
      duration_ms: Math.round(performance.now() - start),
    });
    return response;
  };
}
