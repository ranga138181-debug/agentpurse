import { vi } from "vitest";
import { GET as getAudit } from "@/app/api/audit/route";
import { POST as approval } from "@/app/api/mandates/[id]/approval/route";
import { POST as submit } from "@/app/api/mandates/route";

export const origin = process.env.APP_URL!;

interface Candidate {
  id: string;
  product_id: string;
}

export async function newCookie(): Promise<string> {
  const response = await getAudit(new Request(`${origin}/api/audit`));
  return response.headers.get("Set-Cookie")!.split(";")[0];
}

export function post(url: string, cookie: string, body: unknown, headers = {}) {
  return new Request(`${origin}${url}`, {
    method: "POST",
    headers: { origin, cookie, ...headers },
    body: JSON.stringify(body),
  });
}

export async function proposedMandate(cookie: string, text: string) {
  const response = await submit(
    post("/api/mandates", cookie, { text, timezone: "America/New_York" }),
  );
  const mandate = await response.json();
  const candidateId = (productId: string) =>
    mandate.candidates.find((c: Candidate) => c.product_id === productId)
      .id as string;
  return { mandate, candidateId };
}

export async function approvedMandate(
  cookie: string,
  text = "Gift for mom, max $40",
  productId = "P-001",
) {
  const { mandate, candidateId } = await proposedMandate(cookie, text);
  await approval(
    post(`/api/mandates/${mandate.id}/approval`, cookie, {
      decision: "APPROVE",
      candidate_id: candidateId(productId),
    }),
    { params: Promise.resolve({ id: mandate.id }) },
  );
  return {
    mandateId: mandate.id as string,
    candidateId: candidateId(productId),
  };
}

export async function auditEvents(cookie: string, mandateId: string) {
  const response = await getAudit(
    new Request(`${origin}/api/audit?mandate_id=${mandateId}`, {
      headers: { cookie },
    }),
  );
  const { events } = await response.json();
  return events as {
    event_type: string;
    actor: string;
    decision: string | null;
    reason_codes: string[];
    payload: Record<string, unknown>;
  }[];
}

type Handler = (request: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}) => { status: number; body: unknown } | Promise<never>;

// Replaces the network under the real PayPal client, so requests are built by production code.
export function fakePayPal(handlers: Record<string, Handler> = {}) {
  let orderNumber = 0;
  const defaults: Record<string, Handler> = {
    "POST /v1/oauth2/token": () => ({
      status: 200,
      body: { access_token: "sandbox-token", expires_in: 3600 },
    }),
    "POST /v2/checkout/orders": () => ({
      status: 201,
      body: {
        id: `PP-${crypto.randomUUID()}-${++orderNumber}`,
        status: "CREATED",
      },
    }),
  };
  const calls: {
    key: string;
    headers: Record<string, string>;
    body: unknown;
  }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== "api-m.sandbox.paypal.com") {
      throw new Error(`Unexpected network call to ${url.hostname}`);
    }
    const path = url.pathname.replace(/PP-[^/]+/, "{id}");
    const key = `${init?.method ?? "GET"} ${path}`;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const text = typeof init?.body === "string" ? init.body : "";
    const body = text.startsWith("{") ? JSON.parse(text) : text;
    calls.push({ key, headers, body });
    const handler = handlers[key] ?? defaults[key];
    if (!handler) throw new Error(`No fake PayPal handler for ${key}`);
    const result = await handler({ url: url.pathname, headers, body });
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
  return {
    calls,
    orderCalls: () =>
      calls.filter((call) => call.key !== "POST /v1/oauth2/token"),
  };
}
