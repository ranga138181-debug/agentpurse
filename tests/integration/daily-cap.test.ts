import { gte } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { fakeAdapter } from "@/agent/model/fake";
import { createFixtureSearch } from "@/agent/search/fixture";
import { submitMandate } from "@/app/api/mandates/pipeline";
import { db } from "@/db/client";
import { mandates } from "@/db/schema";
import { createDeadline } from "@/lib/deadline";
import { newCookie } from "./support";

afterEach(() => vi.restoreAllMocks());

const now = new Date();
const midnightUtc = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);
const acceptedToday = () =>
  db.$count(mandates, gte(mandates.created_at, midnightUtc));

async function submit(dailyCap: number) {
  const cookie = await newCookie();
  const response = await submitMandate(
    {
      text: "Headphones, max $50",
      timezone: "America/New_York",
      sessionId: cookie.slice("ap_session=".length).split(".")[0],
      now,
      requestId: crypto.randomUUID(),
      deadline: createDeadline(12000),
    },
    {
      adapter: fakeAdapter,
      dailyCap,
      searchProvider: "fixture",
      createSearch: createFixtureSearch,
    },
  );
  return { response, body: await response.json() };
}

test("IT-SEC-005 a mandate below the daily cap is accepted", async () => {
  const { response } = await submit((await acceptedToday()) + 1);

  expect(response.status).toBe(201);
});

test("IT-SEC-005 at the daily cap a mandate returns 429 DAILY_LIMIT_REACHED with no model call", async () => {
  await submit(1_000_000);
  const before = await acceptedToday();
  const parse = vi.spyOn(fakeAdapter, "parseMandate");

  const { response, body } = await submit(before);

  expect(response.status).toBe(429);
  expect(body.error.code).toBe("DAILY_LIMIT_REACHED");
  expect(parse).not.toHaveBeenCalled();
  expect(await acceptedToday()).toBe(before);
});

test("IT-SEC-005 the cap counts mandates across all sessions", async () => {
  const before = await acceptedToday();

  expect((await submit(before + 1)).response.status).toBe(201);
  expect((await submit(before + 1)).response.status).toBe(429);
});
