import { afterEach, expect, test, vi } from "vitest";
import { createModelAdapter } from "@/agent/model";

const signal = new AbortController().signal;

const parseInput = {
  text: "Gift for Mom, max $40, or 40 dollars",
  today: "2026-11-02",
  weekday: "Monday",
  timezone: "America/New_York",
  signal,
};

const products = ["P-002", "P-001"].map((product_id) => ({
  product_id,
  title: "Title",
  description: "Description",
  category: "home",
  total_cents: 2998,
  estimated_delivery_date: "2026-11-04",
  in_stock: true,
}));

const rankInput = {
  constraints: {
    query: "gift for mom",
    max_total_cents: 4000,
    currency: "USD",
    deliver_by: null,
    exclude_terms: [],
  },
  products,
  boundary: "boundary-token",
  signal,
};

const requiredEnv = {
  DATABASE_URL: "postgres://localhost:5432/agentpurse",
  SESSION_SECRET: "0".repeat(32),
  APP_URL: "http://localhost:3000",
  RENDER_GIT_COMMIT: "sha",
  PAYPAL_CLIENT_ID: "test-client",
  PAYPAL_CLIENT_SECRET: "test-value",
  PAYPAL_ENV: "sandbox",
};

async function loadConfig(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...requiredEnv, ...env })) {
    vi.stubEnv(key, value);
  }
  return import("@/lib/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("UT-AGT-008 AI_PROVIDER=fake selects the deterministic fake adapter", async () => {
  const adapter = createModelAdapter({ AI_PROVIDER: "fake" });

  expect(await adapter.parseMandate(parseInput)).toEqual({
    query: "gift for mom, max , or ",
    deliver_by: null,
    exclude_terms: [],
  });
  expect(await adapter.rankProducts(rankInput)).toEqual({
    ranking: [
      { product_id: "P-002", rationale: "Fake ranking" },
      { product_id: "P-001", rationale: "Fake ranking" },
    ],
  });
});

test("UT-AGT-008 the fake adapter truncates the query to 80 characters", async () => {
  const adapter = createModelAdapter({ AI_PROVIDER: "fake" });

  const output = await adapter.parseMandate({
    ...parseInput,
    text: "A".repeat(200),
  });

  expect(output).toMatchObject({ query: "a".repeat(80) });
});

test("UT-AGT-008 the fake adapter makes no network call", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const adapter = createModelAdapter({ AI_PROVIDER: "fake" });

  await adapter.parseMandate(parseInput);
  await adapter.rankProducts(rankInput);

  expect(fetchSpy).not.toHaveBeenCalled();
});

test("UT-AGT-008 an unknown AI_PROVIDER fails configuration", async () => {
  await expect(loadConfig({ AI_PROVIDER: "skynet" })).rejects.toThrow();
});

test("UT-AGT-008 a missing AI_PROVIDER fails configuration", async () => {
  await expect(loadConfig({ AI_PROVIDER: "" })).rejects.toThrow();
});

test("UT-AGT-008 AI_PROVIDER=fake passes configuration", async () => {
  const { config } = await loadConfig({ AI_PROVIDER: "fake" });

  expect(config.AI_PROVIDER).toBe("fake");
});

test("UT-AGT-008 a real provider without AI_MODEL and AI_API_KEY fails configuration", async () => {
  await expect(
    loadConfig({ AI_PROVIDER: "groq", AI_MODEL: "", AI_API_KEY: "" }),
  ).rejects.toThrow();
  await expect(
    loadConfig({
      AI_PROVIDER: "groq",
      AI_MODEL: "some-model",
      AI_API_KEY: "",
    }),
  ).rejects.toThrow();
});

test("UT-AGT-008 AI_PROVIDER=groq with a model and key selects the provider adapter without a network call", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const settings = {
    AI_PROVIDER: "groq",
    AI_MODEL: "some-model",
    AI_API_KEY: "test-key",
  };

  const { config } = await loadConfig(settings);
  const adapter = createModelAdapter(config);

  expect(config.AI_PROVIDER).toBe("groq");
  expect(adapter).not.toBe(createModelAdapter({ AI_PROVIDER: "fake" }));
  expect(fetchSpy).not.toHaveBeenCalled();
});
