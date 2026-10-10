import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { GET } from "@/app/api/healthz/route";
import { healthResponse } from "@/lib/health";

test("IT-OPS-001 returns 200 with status ok and the deployed SHA when the database is reachable", async () => {
  const response = await GET(new Request("http://localhost:3000/api/healthz"));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    db: "ok",
    version: process.env.RENDER_GIT_COMMIT,
  });
  expect(response.headers.get("Set-Cookie")).toBeNull();
});

test("IT-OPS-001 returns 503 with status degraded when the database is unreachable", async () => {
  const unreachable = drizzle("postgres://postgres@127.0.0.1:1/none");

  const response = await healthResponse(() =>
    unreachable.execute(sql`select 1`),
  );

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    status: "degraded",
    db: "down",
    version: process.env.RENDER_GIT_COMMIT,
  });
});
