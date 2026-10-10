import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { fakeAdapter } from "@/agent/model/fake";
import { createFixtureSearch } from "@/agent/search/fixture";
import { GET as getAudit } from "@/app/api/audit/route";
import { submitMandate } from "@/app/api/mandates/pipeline";
import { POST } from "@/app/api/mandates/route";
import { db } from "@/db/client";
import { candidates, mandates } from "@/db/schema";
import { createDeadline } from "@/lib/deadline";

const origin = process.env.APP_URL!;
const never = () => new Promise<never>(() => {});

afterEach(() => vi.restoreAllMocks());

async function newSession() {
  const response = await getAudit(new Request(`${origin}/api/audit`));
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  return { cookie, id: cookie.slice("ap_session=".length).split(".")[0] };
}

async function post(cookie: string, text: string) {
  const response = await POST(
    new Request(`${origin}/api/mandates`, {
      method: "POST",
      headers: { origin, cookie },
      body: JSON.stringify({ text, timezone: "America/New_York" }),
    }),
  );
  return { response, body: await response.json() };
}

async function run(
  sessionId: string,
  deadlineMs: number,
  createSearch = createFixtureSearch,
) {
  const response = await submitMandate(
    {
      text: "Headphones, max $50",
      timezone: "America/New_York",
      sessionId,
      now: new Date(),
      requestId: crypto.randomUUID(),
      deadline: createDeadline(deadlineMs),
    },
    { adapter: fakeAdapter, searchProvider: "fixture", createSearch },
  );
  return { response, body: await response.json() };
}

async function outcome(session: { cookie: string; id: string }) {
  const [mandate] = await db
    .select()
    .from(mandates)
    .where(eq(mandates.session_id, session.id));
  const stored = await db
    .select()
    .from(candidates)
    .where(eq(candidates.mandate_id, mandate.id));
  const response = await getAudit(
    new Request(`${origin}/api/audit`, { headers: { cookie: session.cookie } }),
  );
  const { events } = await response.json();
  return { mandate, stored, events, last: events.at(-1) };
}

test.each([
  [
    "returns invalid output twice",
    () => Promise.resolve({ query: "", deliver_by: null, exclude_terms: [] }),
    "ZodError",
  ],
  [
    "throws twice",
    () => Promise.reject(new TypeError("provider down")),
    "TypeError",
  ],
])(
  "IT-API-007 a parse call that %s gives 503 AGENT_UNAVAILABLE and fails closed",
  async (_name, parse, errorName) => {
    const session = await newSession();
    const spy = vi.spyOn(fakeAdapter, "parseMandate").mockImplementation(parse);

    const { response, body } = await post(
      session.cookie,
      "Gift for mom, max $40",
    );

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("AGENT_UNAVAILABLE");
    expect(spy).toHaveBeenCalledTimes(2);
    const { mandate, stored, last } = await outcome(session);
    expect(body.error.details).toEqual({ mandate_id: mandate.id });
    expect(mandate).toMatchObject({
      status: "FAILED",
      pick_candidate_id: null,
    });
    expect(stored).toEqual([]);
    expect(last).toMatchObject({
      event_type: "AGENT_ERROR",
      actor: "AGENT",
      payload: { step: "parse", error_code: errorName, attempts: 2 },
    });
    expect(JSON.stringify(body)).not.toContain("provider down");
  },
);

test("IT-API-007 a search that throws gives 503 SEARCH_UNAVAILABLE and fails closed", async () => {
  const session = await newSession();
  const search = vi.fn().mockRejectedValue(new Error("catalog down"));

  const { response, body } = await run(session.id, 5000, () => ({ search }));

  expect(response.status).toBe(503);
  expect(body.error.code).toBe("SEARCH_UNAVAILABLE");
  expect(search).toHaveBeenCalledTimes(1);
  const { mandate, stored, last } = await outcome(session);
  expect(mandate).toMatchObject({ status: "FAILED", pick_candidate_id: null });
  expect(stored).toEqual([]);
  expect(last).toMatchObject({
    event_type: "AGENT_ERROR",
    payload: { step: "search", attempts: 1 },
  });
});

test("IT-API-007 exceeding the deadline during parse gives 504 AGENT_TIMEOUT and fails closed", async () => {
  const session = await newSession();
  vi.spyOn(fakeAdapter, "parseMandate").mockImplementation(never);

  const { response, body } = await run(session.id, 40);

  expect(response.status).toBe(504);
  expect(body.error.code).toBe("AGENT_TIMEOUT");
  const { mandate, stored, last } = await outcome(session);
  expect(body.error.details).toEqual({ mandate_id: mandate.id });
  expect(mandate).toMatchObject({ status: "FAILED", pick_candidate_id: null });
  expect(stored).toEqual([]);
  expect(last).toMatchObject({
    event_type: "AGENT_ERROR",
    payload: { step: "parse", error_code: "DeadlineExceeded" },
  });
});

test("IT-API-007 exceeding the deadline during rank gives 504 instead of the fallback ranking", async () => {
  const session = await newSession();
  vi.spyOn(fakeAdapter, "rankProducts").mockImplementation(never);

  const { response, body } = await run(session.id, 300);

  expect(response.status).toBe(504);
  expect(body.error.code).toBe("AGENT_TIMEOUT");
  const { mandate, stored } = await outcome(session);
  expect(mandate.status).toBe("FAILED");
  expect(stored).toEqual([]);
});

test("IT-API-007 a rank call that stays invalid after one retry uses the fallback ranking", async () => {
  const session = await newSession();
  const spy = vi
    .spyOn(fakeAdapter, "rankProducts")
    .mockResolvedValue({ ranking: [{ product_id: "P-999", rationale: "x" }] });

  const { response, body } = await post(session.cookie, "Headphones, max $50");

  expect(response.status).toBe(201);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(body.status).toBe("PROPOSED");
  const { events } = await outcome(session);
  expect(
    events.find((e: { event_type: string }) => e.event_type === "AGENT_ERROR"),
  ).toMatchObject({ payload: { step: "rank", attempts: 2, fallback: true } });
});
