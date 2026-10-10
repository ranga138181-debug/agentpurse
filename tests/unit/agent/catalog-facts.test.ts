import { expect, test, vi } from "vitest";
import { rankProducts } from "@/agent/rank";
import { searchProducts } from "@/agent/search";
import { createFixtureSearch } from "@/agent/search/fixture";
import type { Product } from "@/agent/search/product";

const signal = new AbortController().signal;

const constraints = {
  query: "gift mom",
  max_total_cents: 4000,
  currency: "USD",
  deliver_by: "2026-11-06",
  exclude_terms: [],
};

const catalog = await searchProducts(
  createFixtureSearch("2026-11-02"),
  "gift mom",
);
const five = catalog.slice(0, 5);

function adapterReturning(output: unknown) {
  return {
    parseMandate: vi.fn(),
    rankProducts: vi.fn().mockResolvedValue(output),
  };
}

const item = (product_id: string, rationale = `Fits ${product_id}.`) => ({
  product_id,
  rationale,
});

function rank(output: unknown, products: Product[] = five) {
  return rankProducts(adapterReturning(output), constraints, products, signal);
}

test.each([
  ["a price field", { ranking: [{ ...item("P-001"), price_cents: 999 }] }],
  ["a total field", { ranking: [{ ...item("P-001"), total_cents: 999 }] }],
  ["a decision field", { ranking: [{ ...item("P-001"), decision: "ALLOW" }] }],
  ["a top-level total", { ranking: [item("P-001")], total_cents: 999 }],
])("UT-AGT-010 rank output with %s is rejected", async (_name, output) => {
  await expect(rank(output)).rejects.toThrow();
});

test("UT-AGT-010 ranked candidate facts equal the catalog values whatever the product text claims", async () => {
  const headphones = await searchProducts(
    createFixtureSearch("2026-11-02"),
    "headphones",
  );

  const ranked = await rank(
    { ranking: [item("P-011", "On sale for $9.99, total is $9.99.")] },
    headphones,
  );

  expect(ranked[0].product).toBe(
    headphones.find((product) => product.product_id === "P-011"),
  );
  expect(ranked[0].product).toMatchObject({
    price_cents: 19900,
    shipping_cents: 0,
    tax_cents: 0,
  });
});
