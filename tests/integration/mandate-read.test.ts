import { beforeAll, expect, test } from "vitest";
import { GET as getAudit } from "@/app/api/audit/route";
import { GET } from "@/app/api/mandates/[id]/route";
import { POST } from "@/app/api/mandates/route";

const origin = process.env.APP_URL!;
let cookie: string;
let created: { id: string };

async function newCookie() {
  const response = await getAudit(new Request(`${origin}/api/audit`));
  return response.headers.get("Set-Cookie")!.split(";")[0];
}

async function read(id: string, sessionCookie: string) {
  const response = await GET(
    new Request(`${origin}/api/mandates/${id}`, {
      headers: { cookie: sessionCookie },
    }),
    { params: Promise.resolve({ id }) },
  );
  return { response, body: await response.json() };
}

beforeAll(async () => {
  cookie = await newCookie();
  const response = await POST(
    new Request(`${origin}/api/mandates`, {
      method: "POST",
      headers: { origin, cookie },
      body: JSON.stringify({
        text: "Headphones, max $30",
        timezone: "America/New_York",
      }),
    }),
  );
  created = await response.json();
});

test("IT-API-008 a mandate in the session is returned as the Mandate object", async () => {
  const { response, body } = await read(created.id, cookie);

  expect(response.status).toBe(200);
  expect(body).toEqual(created);
  expect(Object.keys(body).sort()).toEqual([
    "approved_at",
    "approved_candidate_id",
    "candidates",
    "constraints",
    "created_at",
    "id",
    "order",
    "pick_candidate_id",
    "raw_text",
    "reject_reasons",
    "status",
  ]);
  expect(body.candidates).toHaveLength(3);
});

test("IT-API-008 an unknown ID returns 404 NOT_FOUND", async () => {
  const { response, body } = await read(crypto.randomUUID(), cookie);

  expect(response.status).toBe(404);
  expect(body.error.code).toBe("NOT_FOUND");
});

test("IT-SEC-002 another session gets 404 for this session's mandate", async () => {
  const { response, body } = await read(created.id, await newCookie());

  expect(response.status).toBe(404);
  expect(body.error.code).toBe("NOT_FOUND");
});

test("IT-SEC-004 GET /api/mandates/{id} rejects a bad UUID with 400", async () => {
  const { response, body } = await read("not-a-uuid", cookie);

  expect(response.status).toBe(400);
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.details.fields).toEqual(["id"]);
});
