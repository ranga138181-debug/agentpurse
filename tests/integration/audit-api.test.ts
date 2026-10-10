import { beforeAll, expect, test } from "vitest";
import { GET } from "@/app/api/audit/route";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";

const mandateId = crypto.randomUUID();
let cookie: string;
let seqs: number[];

async function get(query: string, sessionCookie?: string) {
  const headers = sessionCookie ? { cookie: sessionCookie } : undefined;
  const response = await GET(
    new Request(`http://localhost:3000/api/audit${query}`, { headers }),
  );
  return { response, body: await response.json() };
}

beforeAll(async () => {
  const first = await get("");
  cookie = first.response.headers.get("Set-Cookie")!.split(";")[0];
  const sessionId = cookie.slice("ap_session=".length).split(".")[0];
  for (let index = 0; index < 5; index++) {
    await appendAuditEvent(insertAuditEvent, {
      session_id: sessionId,
      mandate_id: index < 2 ? mandateId : null,
      actor: "POLICY",
      event_type: "POLICY_DECISION",
      decision: "BLOCK",
      reason_codes: ["OVER_BUDGET"],
      payload: { rank: index + 1 },
    });
  }
  seqs = (await get("", cookie)).body.events.map(
    (event: { seq: number }) => event.seq,
  );
});

test("IT-AUD-002 returns the session's events in ascending seq by default", () => {
  expect(seqs).toHaveLength(5);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
});

test("IT-AUD-002 returns only events after the cursor with next_after_seq set to the last seq", async () => {
  const { response, body } = await get(`?after_seq=${seqs[1]}`, cookie);

  expect(response.status).toBe(200);
  expect(body.events.map((event: { seq: number }) => event.seq)).toEqual(
    seqs.slice(2),
  );
  expect(body.next_after_seq).toBe(seqs[4]);
});

test("IT-AUD-002 returns an empty page with the supplied cursor when nothing is newer", async () => {
  const { body } = await get(`?after_seq=${seqs[4]}`, cookie);

  expect(body).toEqual({ events: [], next_after_seq: seqs[4] });
});

test("IT-AUD-002 honours limit", async () => {
  const { body } = await get("?limit=2", cookie);

  expect(body.events.map((event: { seq: number }) => event.seq)).toEqual(
    seqs.slice(0, 2),
  );
  expect(body.next_after_seq).toBe(seqs[1]);
});

test("IT-AUD-002 filters by mandate_id", async () => {
  const { body } = await get(`?mandate_id=${mandateId}`, cookie);

  expect(body.events.map((event: { seq: number }) => event.seq)).toEqual(
    seqs.slice(0, 2),
  );
});

test("IT-AUD-002 returns AuditEvent objects", async () => {
  const { body } = await get("?limit=1", cookie);

  expect(body.events[0]).toEqual({
    seq: seqs[0],
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    mandate_id: mandateId,
    actor: "POLICY",
    event_type: "POLICY_DECISION",
    decision: "BLOCK",
    reason_codes: ["OVER_BUDGET"],
    payload: { rank: 1 },
  });
});

test("IT-SEC-002 another session gets an empty events list for this session's audit events", async () => {
  const { response, body } = await get("");

  expect(response.status).toBe(200);
  expect(body).toEqual({ events: [], next_after_seq: 0 });
});

test.each([
  [
    "an unknown parameter",
    "?session_id=7b0c1d5e-2f4a-4c6b-8d9e-0a1b2c3d4e5f",
    "session_id",
  ],
  ["a non-numeric after_seq", "?after_seq=abc", "after_seq"],
  ["a negative after_seq", "?after_seq=-1", "after_seq"],
  ["a fractional limit", "?limit=1.5", "limit"],
  ["limit 0", "?limit=0", "limit"],
  ["limit 501", "?limit=501", "limit"],
  ["a bad mandate_id", "?mandate_id=123", "mandate_id"],
])(
  "IT-SEC-004 GET /api/audit rejects %s with 400",
  async (_name, query, field) => {
    const { response, body } = await get(query, cookie);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fields).toEqual([field]);
  },
);
