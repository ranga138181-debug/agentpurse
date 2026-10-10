import { afterEach, expect, test, vi } from "vitest";
import { PAYPAL_BASE_URL, createPayPalClient } from "@/payment/paypal";

const requiredEnv = {
  DATABASE_URL: "postgres://localhost:5432/agentpurse",
  SESSION_SECRET: "0".repeat(32),
  APP_URL: "http://localhost:3000",
  RENDER_GIT_COMMIT: "sha",
  PAYPAL_CLIENT_ID: "test-client",
  PAYPAL_WEBHOOK_ID: "WH-TEST",
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: "test-client",
  DAILY_MANDATE_CAP: "500",
  PAYPAL_CLIENT_SECRET: "test-value",
  AI_PROVIDER: "fake",
};

async function loadConfig(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...requiredEnv, ...env })) {
    vi.stubEnv(key, value);
  }
  return import("@/lib/config");
}

afterEach(() => vi.unstubAllEnvs());

test.each(["", "live", "production", "Sandbox", "sandbox "])(
  "UT-PAY-001 startup fails when PAYPAL_ENV is %j",
  async (value) => {
    await expect(loadConfig({ PAYPAL_ENV: value })).rejects.toThrow();
  },
);

test("UT-PAY-001 startup succeeds when PAYPAL_ENV is sandbox", async () => {
  const { config } = await loadConfig({ PAYPAL_ENV: "sandbox" });

  expect(config.PAYPAL_ENV).toBe("sandbox");
});

const settings = {
  PAYPAL_CLIENT_ID: "test-client",
  PAYPAL_CLIENT_SECRET: "test-value",
  fetch,
  now: Date.now,
};

test.each([undefined, "", "live"])(
  "UT-PAY-001 the payment client refuses to be created when PAYPAL_ENV is %j",
  (value) => {
    expect(() =>
      createPayPalClient({ ...settings, PAYPAL_ENV: value as string }),
    ).toThrow("sandbox");
  },
);

test("UT-PAY-001 the payment client's base URL is the PayPal sandbox host", () => {
  expect(new URL(PAYPAL_BASE_URL).hostname).toBe("api-m.sandbox.paypal.com");
  expect(
    createPayPalClient({ ...settings, PAYPAL_ENV: "sandbox" }).baseUrl,
  ).toBe(PAYPAL_BASE_URL);
});
