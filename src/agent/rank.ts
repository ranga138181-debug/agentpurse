import { createBoundary } from "./boundary";
import type { MandateConstraints, ModelAdapter } from "./model/adapter";
import { sanitise } from "./sanitise";
import { rankOutputSchema } from "./schemas";
import type { Product } from "./search/product";

export interface RankedProduct {
  product: Product;
  rank: number;
  rationale: string | null;
}

function totalCents(product: Product): number | null {
  const { price_cents, shipping_cents, tax_cents } = product;
  if (price_cents === null || shipping_cents === null || tax_cents === null) {
    return null;
  }
  return price_cents + shipping_cents + tax_cents;
}

export async function rankProducts(
  adapter: ModelAdapter,
  constraints: MandateConstraints,
  products: Product[],
  signal: AbortSignal,
): Promise<RankedProduct[]> {
  if (products.length === 0) return [];
  const output = await adapter.rankProducts({
    constraints,
    products: products.map((product) => ({
      product_id: product.product_id,
      title: product.title,
      description: product.description,
      category: product.category,
      total_cents: totalCents(product),
      estimated_delivery_date: product.estimated_delivery_date,
      in_stock: product.in_stock,
    })),
    boundary: createBoundary(
      products.flatMap((product) => [
        product.product_id,
        product.title,
        product.description,
        product.category,
      ]),
    ),
    signal,
  });

  const { ranking } = rankOutputSchema.parse(output);
  const byId = new Map(
    products.map((product) => [product.product_id, product]),
  );
  const listed = new Set(ranking.map((item) => item.product_id));
  if (
    listed.size !== ranking.length ||
    ranking.some((item) => !byId.has(item.product_id))
  ) {
    throw new Error("Ranking contains an unknown or duplicate product ID");
  }

  // Facts are joined from the searched products by ID; the model supplies only order and rationale.
  return [
    ...ranking.map((item) => ({
      product: byId.get(item.product_id) as Product,
      rationale: sanitise(item.rationale, "rationale"),
    })),
    ...products
      .filter((product) => !listed.has(product.product_id))
      .map((product) => ({ product, rationale: null })),
  ].map((entry, index) => ({ ...entry, rank: index + 1 }));
}
