import { addDays } from "../dates";
import { FIXTURE_CATALOG } from "./fixture-catalog";
import type { ProductSearch } from "./product";

export function createFixtureSearch(today: string): ProductSearch {
  return {
    async search(query, limit) {
      const tokens = new Set(query.toLowerCase().split(/[^a-z0-9]+/));
      return FIXTURE_CATALOG.map((product) => ({
        product,
        score: product.tags.filter((tag) => tokens.has(tag)).length,
      }))
        .filter(({ score }) => score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.product.product_id.localeCompare(b.product.product_id),
        )
        .slice(0, limit)
        .map(({ product }) => ({
          product_id: product.product_id,
          title: product.title,
          description: product.description,
          merchant: "AgentPurse Demo Store",
          category: product.category,
          image_url: null,
          product_url: null,
          price_cents: product.price_cents,
          shipping_cents: product.shipping_cents,
          tax_cents: 0,
          currency: product.currency,
          in_stock: product.in_stock,
          estimated_delivery_date: addDays(today, product.delivery_days),
        }));
    },
  };
}
