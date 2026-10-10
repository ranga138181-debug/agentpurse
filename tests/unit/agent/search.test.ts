import { expect, test } from "vitest";
import { searchProducts } from "@/agent/search";
import { createFixtureSearch } from "@/agent/search/fixture";

const fixture = createFixtureSearch("2026-11-02");

async function ids(query: string, limit = 10) {
  const results = (await fixture.search(query, limit)) as {
    product_id: string;
  }[];
  return results.map((product) => product.product_id);
}

test("UT-AGT-003 orders by tag-match count descending then product ID and returns at most 10", async () => {
  expect(await ids("gift mom")).toEqual([
    "P-001",
    "P-002",
    "P-003",
    "P-004",
    "P-005",
    "P-006",
    "P-008",
    "P-017",
    "P-018",
    "P-007",
  ]);
});

test("UT-AGT-003 tokenises by lower-casing and splitting on non-alphanumerics", async () => {
  expect(await ids("Gift, for MOM!!")).toEqual(await ids("gift mom"));
  expect(await ids("head-phones")).toEqual([]);
  expect(await ids("Headphones")).toEqual(["P-009", "P-010", "P-011"]);
});

test("UT-AGT-003 scores by distinct matching tags", async () => {
  expect((await ids("best mom mug"))[0]).toBe("P-005");
  expect(await ids("gift gift card")).toEqual(await ids("gift card"));
  expect((await ids("gift card"))[0]).toBe("P-012");
});

test("UT-AGT-003 a token must equal a tag, not be part of one", async () => {
  expect(await ids("candles")).toEqual([]);
  expect(await ids("yoga")).toEqual(["P-013"]);
});

test("UT-AGT-003 a query with no matching tag returns no products", async () => {
  expect(await ids("submarine")).toEqual([]);
  expect(await ids("")).toEqual([]);
});

test("UT-AGT-003 honours the limit", async () => {
  expect(await ids("gift mom", 3)).toEqual(["P-001", "P-002", "P-003"]);
});

test("UT-AGT-003 computes the delivery date from today", async () => {
  const [candle] = await fixture.search("candle", 10);
  const [card] = await fixture.search("card", 10);
  const [mug] = await createFixtureSearch("2026-11-29").search("mug", 10);

  expect(candle).toMatchObject({ estimated_delivery_date: "2026-11-04" });
  expect(card).toMatchObject({ estimated_delivery_date: "2026-11-02" });
  expect(mug).toMatchObject({ estimated_delivery_date: "2026-12-05" });
});

test("UT-AGT-003 returns catalog facts in the product shape", async () => {
  const [candle] = await searchProducts(fixture, "candle");

  expect(candle).toEqual({
    product_id: "P-001",
    title: "Scented Candle Gift Set",
    description: "Three soy candles in a gift box.",
    merchant: "AgentPurse Demo Store",
    category: "home",
    image_url: null,
    product_url: null,
    price_cents: 2499,
    shipping_cents: 499,
    tax_cents: 0,
    currency: "USD",
    in_stock: true,
    estimated_delivery_date: "2026-11-04",
  });
});

test("UT-AGT-003 keeps null and foreign-currency facts for the policy engine", async () => {
  const products = await searchProducts(fixture, "gift mom");
  const byId = Object.fromEntries(
    products.map((product) => [product.product_id, product]),
  );

  expect(byId["P-017"].price_cents).toBeNull();
  expect(byId["P-018"].currency).toBe("EUR");
  expect(byId["P-008"].in_stock).toBe(false);
});

test("UT-AGT-003 drops products that fail the product schema and caps results at 10", async () => {
  const valid = (await fixture.search("candle", 1))[0] as object;
  const source = {
    search: async () => [
      { ...valid, product_id: 42 },
      { ...valid, product_url: "http://insecure.example/p" },
      { ...valid, price_cents: 24.99 },
      ...Array.from({ length: 12 }, (_, index) => ({
        ...valid,
        product_id: `X-${index}`,
      })),
    ],
  };

  const products = await searchProducts(source, "anything");

  expect(products.map((product) => product.product_id)).toEqual(
    Array.from({ length: 7 }, (_, index) => `X-${index}`),
  );
});
