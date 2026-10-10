import { expect, test } from "vitest";
import { fallbackRanking } from "@/agent/rank";
import { searchProducts } from "@/agent/search";
import { createFixtureSearch } from "@/agent/search/fixture";

const catalog = await searchProducts(
  createFixtureSearch("2026-11-02"),
  "gift mom",
);

test("UT-AGT-007 fallback ranking orders by total ascending, then product ID, with nulls last", () => {
  const ranked = fallbackRanking(catalog);

  expect(ranked.map(({ product }) => product.product_id)).toEqual([
    "P-005",
    "P-008",
    "P-001",
    "P-018",
    "P-007",
    "P-002",
    "P-006",
    "P-003",
    "P-004",
    "P-017",
  ]);
  expect(ranked.map(({ rank }) => rank)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
});

test("UT-AGT-007 fallback ranking breaks equal totals by product ID", () => {
  const [first] = catalog;
  const tied = ["P-B", "P-A"].map((product_id) => ({ ...first, product_id }));

  expect(
    fallbackRanking(tied).map(({ product }) => product.product_id),
  ).toEqual(["P-A", "P-B"]);
});

test("UT-AGT-007 fallback ranking gives every candidate the fixed rationale", () => {
  const rationales = new Set(
    fallbackRanking(catalog).map(({ rationale }) => rationale),
  );

  expect([...rationales]).toEqual([
    "Ranked by price (model ranking unavailable)",
  ]);
});
