import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Settings the server modules validate at import; tests never use the real session or PayPal values.
const serverEnv = {
  SESSION_SECRET: randomBytes(32).toString("hex"),
  APP_URL: "http://localhost:3000",
  RENDER_GIT_COMMIT: "test-sha",
  AI_PROVIDER: "fake",
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ?? "test-client",
  PAYPAL_CLIENT_SECRET:
    process.env.PAYPAL_CLIENT_SECRET ?? randomBytes(16).toString("hex"),
  PAYPAL_WEBHOOK_ID: "WH-TEST",
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: "test-client",
  DAILY_MANDATE_CAP: "1000000",
};

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/policy/**"],
      thresholds: { branches: 100 },
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: "tests/integration/global-setup.ts",
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          // Each test makes several real database round trips; the 5 s default was occasionally exceeded.
          testTimeout: 15000,
          env: serverEnv,
        },
      },
      {
        extends: true,
        test: {
          name: "eval",
          include: ["tests/eval/**/*.test.ts"],
          globalSetup: "tests/integration/global-setup.ts",
          // 30 mandates against the real model, paced to stay inside its rate limit.
          testTimeout: 30 * 60 * 1000,
          env: serverEnv,
        },
      },
    ],
  },
});
