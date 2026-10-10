import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { config } from "./config";

const COOKIE_PATTERN =
  /(?:^|;\s*)ap_session=([0-9a-f-]{36})\.([0-9a-f]{64})(?:;|$)/;

function sign(id: string): string {
  return createHmac("sha256", config.SESSION_SECRET).update(id).digest("hex");
}

function verifiedSessionId(cookieHeader: string | null): string | null {
  const match = cookieHeader?.match(COOKIE_PATTERN);
  if (!match) return null;
  const [, id, signature] = match;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)))
    ? id
    : null;
}

export async function resolveSession(
  request: Request,
): Promise<{ id: string; setCookie: string | null }> {
  const existing = verifiedSessionId(request.headers.get("cookie"));
  if (existing) return { id: existing, setCookie: null };
  const id = crypto.randomUUID();
  await db.insert(sessions).values({ id });
  return {
    id,
    setCookie: `ap_session=${id}.${sign(id)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
  };
}
