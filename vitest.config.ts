import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
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
          fileParallelism: false,
          env: {
            SESSION_SECRET: randomBytes(32).toString("hex"),
            APP_URL: "http://localhost:3000",
            RENDER_GIT_COMMIT: "test-sha",
          },
        },
      },
    ],
  },
});
