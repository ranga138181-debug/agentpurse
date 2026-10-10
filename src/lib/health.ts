import { config } from "./config";

export async function healthResponse(
  ping: () => Promise<unknown>,
): Promise<Response> {
  const version = config.RENDER_GIT_COMMIT;
  try {
    await ping();
    return Response.json({ status: "ok", db: "ok", version });
  } catch {
    return Response.json(
      { status: "degraded", db: "down", version },
      { status: 503 },
    );
  }
}
