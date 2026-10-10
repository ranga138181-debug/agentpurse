import { afterEach, expect, test, vi } from "vitest";
import { log, redact } from "@/lib/logger";
import { route } from "@/lib/route";

afterEach(() => vi.restoreAllMocks());

test("UT-OPS-001 emits one JSON line with request_id, route, status and duration_ms", async () => {
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const handler = route("/api/example", async () =>
    Response.json({}, { status: 201 }),
  );

  const response = await handler(
    new Request("http://localhost/api/example", { method: "POST" }),
  );

  expect(write).toHaveBeenCalledTimes(1);
  const line = JSON.parse(String(write.mock.calls[0][0]));
  expect(line).toMatchObject({
    level: "info",
    route: "/api/example",
    method: "POST",
    status: 201,
  });
  expect(line.request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(line.duration_ms).toBeGreaterThanOrEqual(0);
  expect(Date.parse(line.ts)).not.toBeNaN();
  expect(response.headers.get("X-Request-Id")).toBe(line.request_id);
});

test("UT-OPS-001 passes the request_id to the handler", async () => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const handler = route("/api/example", async (_request, requestId) =>
    Response.json({ requestId }),
  );

  const response = await handler(new Request("http://localhost/api/example"));

  expect((await response.json()).requestId).toBe(
    response.headers.get("X-Request-Id"),
  );
});

test.each([
  "authorization",
  "cookie",
  "set-cookie",
  "client_secret",
  "access_token",
  "api_key",
  "password",
  "secret",
  "session_secret",
  "channel3_api_key",
  "Authorization",
])("UT-OPS-001 redacts the value of key %s", (key) => {
  expect(redact({ [key]: "sensitive" })).toEqual({ [key]: "[REDACTED]" });
});

test("UT-OPS-001 redacts listed keys at depth and leaves other values unchanged", () => {
  const payload = {
    a: { b: [{ password: "x", keep: 1 }], access_token: { nested: "x" } },
    keyboard: "ok",
  };

  expect(redact(payload)).toEqual({
    a: { b: [{ password: "[REDACTED]", keep: 1 }], access_token: "[REDACTED]" },
    keyboard: "ok",
  });
});

test("UT-OPS-001 redacts fields in the emitted line", () => {
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

  log("info", "example", { headers: { cookie: "ap_session=abc" } });

  expect(JSON.parse(String(write.mock.calls[0][0])).headers.cookie).toBe(
    "[REDACTED]",
  );
});
