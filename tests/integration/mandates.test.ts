import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { fakeAdapter } from "@/agent/model/fake";
import { GET as getAudit } from "@/app/api/audit/route";
import { POST } from "@/app/api/mandates/route";
import { db } from "@/db/client";
import { candidates, mandates } from "@/db/schema";

const origin = process.env.APP_URL!;

afterEach(() => vi.restoreAllMocks());

async function newSession() {
  const response = await getAudit(new Request(`${origin}/api/audit`));
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  return { cookie, id: cookie.slice("ap_session=".length).split(".")[0] };
}

async function submit(cookie: string, body: unknown) {
  const response = await POST(
    new Request(`${origin}/api/mandates`, {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { response, body: await response.json() };
}

const mandate = (text: string) => ({ text, timezone: "America/New_York" });

async function events(cookie: string) {
  const response = await getAudit(
    new Request(`${origin}/api/audit`, { headers: { cookie } }),
  );
  return (await response.json()).events as {
    event_type: string;
    actor: string;
    decision: string | null;
    reason_codes: string[];
    mandate_id: string;
    payload: Record<string, unknown>;
  }[];
}

const storedMandates = (sessionId: string) =>
  db.select().from(mandates).where(eq(mandates.session_id, sessionId));

test("IT-API-001 a valid mandate returns 201, is stored unchanged and appends MANDATE_RECEIVED", async () => {
  const session = await newSession();
  const text = "  Gift for mom, max $40  ";

  const { response, body } = await submit(session.cookie, mandate(text));

  expect(response.status).toBe(201);
  expect(body.raw_text).toBe(text);
  expect(body.order).toBeNull();
  const [stored] = await storedMandates(session.id);
  expect(stored).toMatchObject({
    id: body.id,
    raw_text: text,
    timezone: "America/New_York",
  });
  const [first] = await events(session.cookie);
  expect(first).toMatchObject({
    event_type: "MANDATE_RECEIVED",
    actor: "USER",
    mandate_id: body.id,
  });
});

test.each([
  ["empty text", mandate("")],
  ["whitespace-only text", mandate("   ")],
  ["501 characters", mandate("x".repeat(501))],
  ["an invalid timezone", { text: "Gift, max $40", timezone: "Mars/Base" }],
  ["an unknown field", { ...mandate("Gift, max $40"), max_total_cents: 1 }],
])(
  "IT-API-001 %s returns 400, stores nothing and makes no model call",
  async (_name, body) => {
    const session = await newSession();
    const parse = vi.spyOn(fakeAdapter, "parseMandate");

    const result = await submit(session.cookie, body);

    expect(result.response.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(await storedMandates(session.id)).toEqual([]);
    expect(await events(session.cookie)).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  },
);

test.each([
  [
    "no amount",
    "Gift for mom by Friday",
    "MANDATE_INCOMPLETE",
    "BUDGET_MISSING",
  ],
  [
    "two amounts",
    "Gift, $40 or maybe $60",
    "MANDATE_AMBIGUOUS",
    "BUDGET_AMBIGUOUS",
  ],
  [
    "a zero budget",
    "Gift for mom, max $0",
    "MANDATE_INVALID",
    "BUDGET_NOT_POSITIVE",
  ],
  [
    "a budget above $500",
    "A laptop, max $5000",
    "MANDATE_INVALID",
    "BUDGET_EXCEEDS_CAP",
  ],
  [
    "a non-USD amount",
    "Gift for mom, max €40",
    "MANDATE_INVALID",
    "UNSUPPORTED_CURRENCY",
  ],
])(
  "IT-API-002 %s returns 422 %s with %s before any model call",
  async (_name, text, code, reason) => {
    const session = await newSession();
    const parse = vi.spyOn(fakeAdapter, "parseMandate");

    const { response, body } = await submit(session.cookie, mandate(text));

    expect(response.status).toBe(422);
    expect(body.error.code).toBe(code);
    expect(body.error.details.reason_codes).toEqual([reason]);
    const [stored] = await storedMandates(session.id);
    expect(stored).toMatchObject({
      id: body.error.details.mandate_id,
      status: "REJECTED",
      reject_reasons: [reason],
      query: null,
    });
    expect(
      (await events(session.cookie)).map((event) => event.event_type),
    ).toEqual(["MANDATE_RECEIVED", "MANDATE_REJECTED"]);
    expect((await events(session.cookie))[1]).toMatchObject({
      actor: "POLICY",
      decision: "BLOCK",
      reason_codes: [reason],
    });
    expect(parse).not.toHaveBeenCalled();
    expect(
      await db
        .select()
        .from(candidates)
        .where(eq(candidates.mandate_id, stored.id)),
    ).toEqual([]);
  },
);

test.each([
  ["in the past", "2000-01-01", "DEADLINE_IN_PAST"],
  ["more than 60 days ahead", "2999-01-01", "DEADLINE_TOO_FAR"],
])(
  "IT-API-002 a deadline %s returns 422 MANDATE_INVALID with %s and runs no search",
  async (_name, deliver_by, reason) => {
    const session = await newSession();
    vi.spyOn(fakeAdapter, "parseMandate").mockResolvedValueOnce({
      query: "gift for mom",
      deliver_by,
      exclude_terms: [],
    });

    const { response, body } = await submit(
      session.cookie,
      mandate("Gift for mom, max $40"),
    );

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("MANDATE_INVALID");
    expect(body.error.details.reason_codes).toEqual([reason]);
    const [stored] = await storedMandates(session.id);
    expect(stored.status).toBe("REJECTED");
    expect(
      (await events(session.cookie)).map((event) => event.event_type),
    ).toEqual(["MANDATE_RECEIVED", "MANDATE_PARSED", "MANDATE_REJECTED"]);
  },
);

test("IT-API-003 search results are stored as candidates and SEARCH_COMPLETED lists their IDs", async () => {
  const session = await newSession();

  const { body } = await submit(session.cookie, mandate("Headphones, max $50"));

  const ids = ["P-009", "P-010", "P-011"];
  expect(
    body.candidates.map((c: { product_id: string }) => c.product_id),
  ).toEqual(ids);
  const search = (await events(session.cookie)).find(
    (event) => event.event_type === "SEARCH_COMPLETED",
  );
  expect(search).toMatchObject({
    actor: "AGENT",
    payload: { provider: "fixture", product_ids: ids },
  });
});

test("IT-API-004 every candidate is stored with a decision, one POLICY_DECISION each, and a catalog snapshot", async () => {
  const session = await newSession();

  const { body } = await submit(
    session.cookie,
    mandate("Gift for mom, max $40"),
  );

  const stored = await db
    .select()
    .from(candidates)
    .where(eq(candidates.mandate_id, body.id))
    .orderBy(candidates.rank);
  expect(stored).toHaveLength(10);
  expect(stored.every((row) => ["ALLOW", "BLOCK"].includes(row.decision))).toBe(
    true,
  );
  expect(stored.map((row) => row.rank)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  const decisions = (await events(session.cookie)).filter(
    (event) => event.event_type === "POLICY_DECISION",
  );
  expect(decisions.map((event) => event.payload.product_id)).toEqual(
    stored.map((row) => row.product_id),
  );
  expect(decisions.map((event) => event.decision)).toEqual(
    stored.map((row) => row.decision),
  );
  const byId = Object.fromEntries(stored.map((row) => [row.product_id, row]));
  expect(byId["P-003"]).toMatchObject({
    title: "Spa Gift Basket",
    merchant: "AgentPurse Demo Store",
    category: "beauty",
    price_cents: 3600,
    shipping_cents: 500,
    tax_cents: 0,
    total_cents: 4100,
    currency: "USD",
    in_stock: true,
    decision: "BLOCK",
    reason_codes: ["OVER_BUDGET"],
    policy_version: "1.0.0",
    rationale: "Fake ranking",
  });
  expect(byId["P-003"].estimated_delivery_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(byId["P-008"].reason_codes).toEqual(["OUT_OF_STOCK"]);
  expect(byId["P-017"]).toMatchObject({
    total_cents: null,
    reason_codes: ["INCOMPLETE_PRODUCT_DATA"],
  });
  expect(byId["P-018"].reason_codes).toEqual(["CURRENCY_MISMATCH"]);
  expect(body.candidates[0]).not.toHaveProperty("mandate_id");
  expect(body.constraints).toEqual({
    query: "gift for mom, max ",
    max_total_cents: 4000,
    currency: "USD",
    deliver_by: null,
    exclude_terms: [],
  });
});

test("IT-API-005 the pick is the first ALLOW candidate by rank", async () => {
  const session = await newSession();

  const { response, body } = await submit(
    session.cookie,
    mandate("Headphones, max $30"),
  );

  expect(response.status).toBe(201);
  expect(body.status).toBe("PROPOSED");
  expect(
    body.candidates.map((c: { rank: number; decision: string }) => [
      c.rank,
      c.decision,
    ]),
  ).toEqual([
    [1, "BLOCK"],
    [2, "ALLOW"],
    [3, "BLOCK"],
  ]);
  expect(body.pick_candidate_id).toBe(body.candidates[1].id);
  const log = await events(session.cookie);
  expect(log.map((event) => event.event_type)).toEqual([
    "MANDATE_RECEIVED",
    "MANDATE_PARSED",
    "SEARCH_COMPLETED",
    "POLICY_DECISION",
    "POLICY_DECISION",
    "POLICY_DECISION",
    "PICK_PROPOSED",
  ]);
  expect(log.at(-1)).toMatchObject({
    actor: "AGENT",
    payload: { product_id: "P-010", total_cents: 2298, rank: 2 },
  });
});

test("IT-API-005 when every candidate is BLOCK there is no pick", async () => {
  const session = await newSession();

  const { response, body } = await submit(
    session.cookie,
    mandate("Headphones, max $5"),
  );

  expect(response.status).toBe(201);
  expect(body.status).toBe("NO_ELIGIBLE_PRODUCT");
  expect(body.pick_candidate_id).toBeNull();
  expect((await events(session.cookie)).at(-1)).toMatchObject({
    event_type: "NO_ELIGIBLE_PRODUCT",
    actor: "POLICY",
    decision: "BLOCK",
  });
});

test("IT-API-005 when search returns nothing there is no pick and no rank call", async () => {
  const session = await newSession();
  const rank = vi.spyOn(fakeAdapter, "rankProducts");

  const { response, body } = await submit(
    session.cookie,
    mandate("A submarine, max $40"),
  );

  expect(response.status).toBe(201);
  expect(body).toMatchObject({
    status: "NO_ELIGIBLE_PRODUCT",
    candidates: [],
    pick_candidate_id: null,
  });
  expect(rank).not.toHaveBeenCalled();
});

test("UT-AGT-007 a failed rank call falls back to price order and records AGENT_ERROR", async () => {
  const session = await newSession();
  vi.spyOn(fakeAdapter, "rankProducts").mockRejectedValue(new Error("boom"));

  const { response, body } = await submit(
    session.cookie,
    mandate("Headphones, max $50"),
  );

  expect(response.status).toBe(201);
  expect(
    body.candidates.map((c: { product_id: string }) => c.product_id),
  ).toEqual(["P-010", "P-009", "P-011"]);
  expect(body.candidates[0].rationale).toBe(
    "Ranked by price (model ranking unavailable)",
  );
  const error = (await events(session.cookie)).find(
    (event) => event.event_type === "AGENT_ERROR",
  );
  expect(error).toMatchObject({
    actor: "AGENT",
    payload: { step: "rank", fallback: true },
  });
});
