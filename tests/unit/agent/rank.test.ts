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

test("UT-AGT-004 a full valid ranking is applied in listed order", async () => {
  const ranked = await rank({
    ranking: ["P-005", "P-001", "P-004", "P-002", "P-003"].map((id) =>
      item(id),
    ),
  });

  expect(ranked.map(({ product, rank }) => [product.product_id, rank])).toEqual(
    [
      ["P-005", 1],
      ["P-001", 2],
      ["P-004", 3],
      ["P-002", 4],
      ["P-003", 5],
    ],
  );
  expect(ranked[0].rationale).toBe("Fits P-005.");
});

test("UT-AGT-004 omitted products are appended in search order with a null rationale", async () => {
  const ranked = await rank({
    ranking: [item("P-004"), item("P-002"), item("P-005")],
  });

  expect(
    ranked.map(({ product, rank, rationale }) => [
      product.product_id,
      rank,
      rationale,
    ]),
  ).toEqual([
    ["P-004", 1, "Fits P-004."],
    ["P-002", 2, "Fits P-002."],
    ["P-005", 3, "Fits P-005."],
    ["P-001", 4, null],
    ["P-003", 5, null],
  ]);
});

test.each([
  ["an ID that was not searched", { ranking: [item("P-001"), item("P-999")] }],
  ["a duplicate ID", { ranking: [item("P-001"), item("P-001")] }],
  ["an empty ranking", { ranking: [] }],
  [
    "more items than searched products",
    { ranking: [...five.map((p) => item(p.product_id)), item("P-006")] },
  ],
  ["output that fails the schema", { ranking: [{ product_id: "P-001" }] }],
])("UT-AGT-004 %s makes the whole output invalid", async (_name, output) => {
  await expect(rank(output)).rejects.toThrow();
});

test("UT-AGT-004 with no searched products the rank call is skipped", async () => {
  const adapter = adapterReturning({ ranking: [] });

  const ranked = await rankProducts(adapter, constraints, [], signal);

  expect(ranked).toEqual([]);
  expect(adapter.rankProducts).not.toHaveBeenCalled();
});

test("UT-AGT-004 rationales have URLs and markup removed", async () => {
  const ranked = await rank({
    ranking: [item("P-001", "Buy at https://evil.example now <b>cheap</b>")],
  });

  expect(ranked[0].rationale).toBe("Buy at now cheap");
});

test("UT-AGT-004 the model receives the constraints, ranking fields and a boundary absent from product text", async () => {
  const adapter = adapterReturning({ ranking: [item("P-001")] });

  await rankProducts(adapter, constraints, five, signal);

  const input = adapter.rankProducts.mock.calls[0][0];
  expect(input.constraints).toEqual(constraints);
  expect(input.signal).toBe(signal);
  expect(input.products[0]).toEqual({
    product_id: "P-001",
    title: "Scented Candle Gift Set",
    description: "Three soy candles in a gift box.",
    category: "home",
    total_cents: 2998,
    estimated_delivery_date: "2026-11-04",
    in_stock: true,
  });
  expect(JSON.stringify(input.products)).not.toContain(input.boundary);
});

test("UT-AGT-004 a product with a null amount is sent with a null total", async () => {
  const adapter = adapterReturning({ ranking: [item("P-017")] });
  const mystery = catalog.filter((product) => product.product_id === "P-017");

  await rankProducts(adapter, constraints, mystery, signal);

  expect(
    adapter.rankProducts.mock.calls[0][0].products[0].total_cents,
  ).toBeNull();
});
