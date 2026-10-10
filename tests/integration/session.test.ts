import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { sessionRoute } from "@/lib/session-route";

const url = "http://localhost:3000/api/example";
const handler = sessionRoute("/api/example", async (_request, { sessionId }) =>
  Response.json({ sessionId }),
);

async function call(init?: RequestInit) {
  const response = await handler(new Request(url, init));
  const setCookie = response.headers.get("Set-Cookie");
  return {
    response,
    setCookie,
    cookie: setCookie?.split(";")[0],
    body: await response.json(),
  };
}

test("IT-SEC-002 a request without a cookie is issued a stored session", async () => {
  const { setCookie, body } = await call();

  expect(setCookie).toMatch(/^ap_session=[0-9a-f-]{36}\.[0-9a-f]{64}; /);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Lax");
  expect(setCookie).toContain("Path=/");
  expect(setCookie).toContain("Max-Age=604800");
  expect(
    await db.select().from(sessions).where(eq(sessions.id, body.sessionId)),
  ).toHaveLength(1);
});

test("IT-SEC-002 a valid cookie keeps its session", async () => {
  const first = await call();

  const second = await call({ headers: { cookie: first.cookie! } });

  expect(second.body.sessionId).toBe(first.body.sessionId);
  expect(second.setCookie).toBeNull();
});

test.each([
  [
    "a changed signature",
    (cookie: string) =>
      cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0"),
  ],
  [
    "another session id under the same signature",
    (cookie: string) =>
      `ap_session=${crypto.randomUUID()}.${cookie.split(".")[1]}`,
  ],
  ["no signature", (cookie: string) => cookie.split(".")[0]],
])(
  "IT-SEC-002 a tampered cookie with %s yields a fresh session",
  async (_name, tamper) => {
    const first = await call();

    const second = await call({ headers: { cookie: tamper(first.cookie!) } });

    expect(second.body.sessionId).not.toBe(first.body.sessionId);
    expect(second.setCookie).toMatch(/^ap_session=/);
  },
);

test.each([
  ["missing", {}],
  ["foreign", { origin: "https://evil.example" }],
])(
  "IT-SEC-006 a POST with a %s Origin is rejected with 403 FORBIDDEN_ORIGIN",
  async (_name, headers) => {
    const inner = vi.fn();
    const guarded = sessionRoute("/api/example", inner);

    const response = await guarded(
      new Request(url, { method: "POST", headers }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN_ORIGIN",
        message: expect.any(String),
        request_id: response.headers.get("X-Request-Id"),
      },
    });
    expect(inner).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  },
);

test("IT-SEC-006 a POST whose Origin equals APP_URL is handled", async () => {
  const { response } = await call({
    method: "POST",
    headers: { origin: process.env.APP_URL! },
  });

  expect(response.status).toBe(200);
});

test("IT-SEC-006 a GET needs no Origin", async () => {
  const { response } = await call();

  expect(response.status).toBe(200);
});
