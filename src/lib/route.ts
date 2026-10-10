import { log } from "./logger";

type Handler = (request: Request, requestId: string) => Promise<Response>;

export function route(
  name: string,
  handler: Handler,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = crypto.randomUUID();
    const start = performance.now();
    const response = await handler(request, requestId);
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
