import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { fakeAdapter } from "@/agent/model/fake";
import { GET as getAudit } from "@/app/api/audit/route";
import { GET as healthz } from "@/app/api/healthz/route";
import { POST as approval } from "@/app/api/mandates/[id]/approval/route";
import { POST as submit } from "@/app/api/mandates/route";
import { db } from "@/db/client";
import { mandates } from "@/db/schema";
import { resetRateLimits, retryAfterSeconds } from "@/lib/rate-limit";
import { newCookie, origin, post } from "./support";

afterEach(() => vi.restoreAllMocks());

const sessionIdOf = (cookie: string) =>
  cookie.slice("ap_session=".length).split(".")[0];

function mandate(cookie: string, ip = "203.0.113.7") {
  return submit(
    post(
      "/api/mandates",
      cookie,
      { text: "Headphones, max $50", timezone: "America/New_York" },
      { "x-forwarded-for": ip },
    ),
  );
}

test("IT-SEC-001 the sixth mandate in a minute returns 429 RATE_LIMITED with Retry-After and no model call", async () => {
  const cookie = await newCookie();
  for (let count = 0; count < 5; count++) {
    expect((await mandate(cookie)).status).toBe(201);
  }
  const parse = vi.spyOn(fakeAdapter, "parseMandate");

  const response = await mandate(cookie);

  expect(response.status).toBe(429);
  expect((await response.json()).error.code).toBe("RATE_LIMITED");
  const retryAfter = Number(response.headers.get("Retry-After"));
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(60);
  expect(parse).not.toHaveBeenCalled();
  expect(
    await db
      .select()
      .from(mandates)
      .where(eq(mandates.session_id, sessionIdOf(cookie))),
  ).toHaveLength(5);
});

test("IT-SEC-001 the limit is checked before validation", async () => {
  const cookie = await newCookie();
  for (let count = 0; count < 5; count++) await mandate(cookie);

  const response = await submit(
    post("/api/mandates", cookie, { text: "", timezone: "nowhere" }),
  );

  expect(response.status).toBe(429);
});

test("IT-SEC-001 one session's limit does not affect another session", async () => {
  const first = await newCookie();
  for (let count = 0; count < 5; count++) await mandate(first);

  expect((await mandate(await newCookie())).status).toBe(201);
});

test("IT-SEC-001 the twenty-first mandate in a minute from one IP returns 429 across sessions", async () => {
  const ip = "198.51.100.23";
  for (let count = 0; count < 20; count++) {
    expect((await mandate(await newCookie(), ip)).status).toBe(201);
  }

  expect((await mandate(await newCookie(), ip)).status).toBe(429);
  expect((await mandate(await newCookie(), "198.51.100.24")).status).toBe(201);
});

test("IT-SEC-001 the client IP is the first address in the forwarded-for header", async () => {
  for (let count = 0; count < 20; count++) {
    await mandate(await newCookie(), "192.0.2.1, 10.0.0.1");
  }

  expect((await mandate(await newCookie(), "192.0.2.1, 10.9.9.9")).status).toBe(
    429,
  );
});

test("IT-SEC-001 other POST endpoints allow 30 requests a minute per session", async () => {
  const cookie = await newCookie();
  const id = crypto.randomUUID();
  const decline = () =>
    approval(
      post(`/api/mandates/${id}/approval`, cookie, { decision: "DECLINE" }),
      { params: Promise.resolve({ id }) },
    );
  for (let count = 0; count < 30; count++) {
    expect((await decline()).status).toBe(404);
  }

  const response = await decline();

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
});

test("IT-SEC-001 GET endpoints allow 120 requests a minute per session", async () => {
  const cookie = await newCookie();
  const read = () =>
    getAudit(new Request(`${origin}/api/audit`, { headers: { cookie } }));
  // newCookie already made one GET in this session.
  for (let count = 0; count < 119; count++) {
    expect((await read()).status).toBe(200);
  }

  expect((await read()).status).toBe(429);
});

test("IT-SEC-001 the health endpoint is not rate limited", async () => {
  for (let count = 0; count < 130; count++) {
    expect((await healthz(new Request(`${origin}/api/healthz`))).status).toBe(
      200,
    );
  }
});

test("IT-SEC-001 a window is fixed at one minute and Retry-After counts down to its end", () => {
  resetRateLimits();
  const limits = [{ key: "window-test", limit: 2 }];
  const start = 1_000 * 60_000;

  expect(retryAfterSeconds(limits, start)).toBeNull();
  expect(retryAfterSeconds(limits, start + 10_000)).toBeNull();
  expect(retryAfterSeconds(limits, start + 15_000)).toBe(45);
  expect(retryAfterSeconds(limits, start + 59_999)).toBe(1);
  expect(retryAfterSeconds(limits, start + 60_000)).toBeNull();
});
