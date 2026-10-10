import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Against a deployed host (REL-001) no local server is started.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command:
          "pnpm build && node --env-file-if-exists=.env.local scripts/migrate.mjs && pnpm start",
        url: "http://localhost:3000/api/healthz",
        timeout: 180_000,
        reuseExistingServer: false,
      },
});
