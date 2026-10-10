import { expect, test } from "vitest";
import { GET as getAudit } from "@/app/api/audit/route";
import { POST as approval } from "@/app/api/mandates/[id]/approval/route";
import { POST as submit } from "@/app/api/mandates/route";

const origin = process.env.APP_URL!;

interface Candidate {
  id: string;
  product_id: string;
  decision: string;
}

async function newCookie() {
  const response = await getAudit(new Request(`${origin}/api/audit`));
  return response.headers.get("Set-Cookie")!.split(";")[0];
}

async function proposed(cookie: string, text = "Headphones, max $50") {
  const response = await submit(
    new Request(`${origin}/api/mandates`, {
      method: "POST",
      headers: { origin, cookie },
      body: JSON.stringify({ text, timezone: "America/New_York" }),
    }),
  );
  const mandate = await response.json();
  const byProduct = (productId: string) =>
    mandate.candidates.find((c: Candidate) => c.product_id === productId)
      .id as string;
  return { mandate, byProduct };
}

async function decide(
  cookie: string,
  mandateId: string,
  body: unknown,
  headers: Record<string, string> = { origin },
) {
  const response = await approval(
    new Request(`${origin}/api/mandates/${mandateId}/approval`, {
      method: "POST",
      headers: { cookie, ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: mandateId }) },
  );
  return { response, body: await response.json() };
}

async function eventTypes(cookie: string, mandateId: string) {
  const response = await getAudit(
    new Request(`${origin}/api/audit?mandate_id=${mandateId}`, {
      headers: { cookie },
    }),
  );
  const { events } = await response.json();
  return {
    events,
    types: events.map((e: { event_type: string }) => e.event_type) as string[],
  };
}

test("IT-API-006 approving an ALLOW candidate sets APPROVED and appends USER_APPROVED", async () => {
  const cookie = await newCookie();
  const { mandate, byProduct } = await proposed(cookie);
  const candidate_id = byProduct("P-009");
  const before = Date.now();

  const { response, body } = await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id,
  });

  expect(response.status).toBe(200);
  expect(body).toMatchObject({
    id: mandate.id,
    status: "APPROVED",
    approved_candidate_id: candidate_id,
  });
  expect(Date.parse(body.approved_at)).toBeGreaterThan(before - 5000);
  const { events } = await eventTypes(cookie, mandate.id);
  expect(events.at(-1)).toMatchObject({
    event_type: "USER_APPROVED",
    actor: "USER",
    decision: "ALLOW",
    payload: { product_id: "P-009", total_cents: 4999 },
  });
});

test("IT-API-006 approving a BLOCK candidate returns 409 POLICY_BLOCKED and appends APPROVAL_BLOCKED", async () => {
  const cookie = await newCookie();
  const { mandate, byProduct } = await proposed(cookie);

  const { response, body } = await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id: byProduct("P-011"),
  });

  expect(response.status).toBe(409);
  expect(body.error).toMatchObject({
    code: "POLICY_BLOCKED",
    details: { reason_codes: ["OVER_BUDGET"] },
  });
  const { events } = await eventTypes(cookie, mandate.id);
  expect(events.at(-1)).toMatchObject({
    event_type: "APPROVAL_BLOCKED",
    actor: "POLICY",
    decision: "BLOCK",
    reason_codes: ["OVER_BUDGET"],
    payload: { product_id: "P-011" },
  });
  const after = await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id: byProduct("P-010"),
  });
  expect(after.body.status).toBe("APPROVED");
});

test("IT-API-006 declining sets DECLINED and appends USER_DECLINED", async () => {
  const cookie = await newCookie();
  const { mandate } = await proposed(cookie);

  const { response, body } = await decide(cookie, mandate.id, {
    decision: "DECLINE",
  });

  expect(response.status).toBe(200);
  expect(body.status).toBe("DECLINED");
  expect(body.approved_candidate_id).toBeNull();
  const { events } = await eventTypes(cookie, mandate.id);
  expect(events.at(-1)).toMatchObject({
    event_type: "USER_DECLINED",
    actor: "USER",
  });
});

test.each([
  ["approval", (id: string) => ({ decision: "APPROVE", candidate_id: id })],
  ["decline", () => ({ decision: "DECLINE" })],
])(
  "IT-API-006 an identical repeated %s returns 200 and appends no audit event",
  async (_name, bodyFor) => {
    const cookie = await newCookie();
    const { mandate, byProduct } = await proposed(cookie);
    const body = bodyFor(byProduct("P-010"));
    const first = await decide(cookie, mandate.id, body);
    const { types } = await eventTypes(cookie, mandate.id);

    const second = await decide(cookie, mandate.id, body);

    expect(second.response.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect((await eventTypes(cookie, mandate.id)).types).toEqual(types);
  },
);

test("IT-API-006 a conflicting decision on a decided mandate returns 409 INVALID_STATE", async () => {
  const cookie = await newCookie();
  const { mandate, byProduct } = await proposed(cookie);
  await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id: byProduct("P-010"),
  });
  const { types } = await eventTypes(cookie, mandate.id);

  const other = await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id: byProduct("P-009"),
  });
  const decline = await decide(cookie, mandate.id, { decision: "DECLINE" });

  for (const { response, body } of [other, decline]) {
    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({
      code: "INVALID_STATE",
      details: { reason: "MANDATE_NOT_PROPOSED" },
    });
  }
  expect((await eventTypes(cookie, mandate.id)).types).toEqual(types);
});

test("IT-API-006 a mandate with no eligible product cannot be approved", async () => {
  const cookie = await newCookie();
  const { mandate, byProduct } = await proposed(cookie, "Headphones, max $5");

  const { response, body } = await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id: byProduct("P-010"),
  });

  expect(response.status).toBe(409);
  expect(body.error.details.reason).toBe("MANDATE_NOT_PROPOSED");
});

test("IT-API-006 a candidate of another mandate or an unknown candidate returns 404", async () => {
  const cookie = await newCookie();
  const { mandate } = await proposed(cookie);
  const other = await proposed(cookie);

  const foreign = await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id: other.byProduct("P-010"),
  });
  const unknown = await decide(cookie, mandate.id, {
    decision: "APPROVE",
    candidate_id: crypto.randomUUID(),
  });

  for (const { response, body } of [foreign, unknown]) {
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  }
});

test("IT-SEC-002 another session gets 404 when deciding this session's mandate", async () => {
  const { mandate, byProduct } = await proposed(await newCookie());

  const { response, body } = await decide(await newCookie(), mandate.id, {
    decision: "APPROVE",
    candidate_id: byProduct("P-010"),
  });

  expect(response.status).toBe(404);
  expect(body.error.code).toBe("NOT_FOUND");
});

test.each([
  ["an unknown field", { decision: "DECLINE", amount: 1 }],
  ["an unknown decision", { decision: "MAYBE" }],
  ["APPROVE without a candidate", { decision: "APPROVE" }],
  [
    "APPROVE with a bad candidate UUID",
    { decision: "APPROVE", candidate_id: "x" },
  ],
  [
    "DECLINE with a candidate",
    { decision: "DECLINE", candidate_id: crypto.randomUUID() },
  ],
])(
  "IT-SEC-004 the approval endpoint rejects %s with 400 and no side effect",
  async (_name, body) => {
    const cookie = await newCookie();
    const { mandate } = await proposed(cookie);
    const { types } = await eventTypes(cookie, mandate.id);

    const result = await decide(cookie, mandate.id, body);

    expect(result.response.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect((await eventTypes(cookie, mandate.id)).types).toEqual(types);
  },
);

test("IT-SEC-004 the approval endpoint rejects a bad mandate UUID with 400", async () => {
  const { response } = await decide(await newCookie(), "not-a-uuid", {
    decision: "DECLINE",
  });

  expect(response.status).toBe(400);
});

test.each([
  ["missing", {}],
  ["foreign", { origin: "https://evil.example" }],
])(
  "IT-SEC-006 an approval POST with a %s Origin is rejected with 403",
  async (_name, headers) => {
    const cookie = await newCookie();
    const { mandate } = await proposed(cookie);

    const { response, body } = await decide(
      cookie,
      mandate.id,
      { decision: "DECLINE" },
      headers,
    );

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN_ORIGIN");
  },
);
