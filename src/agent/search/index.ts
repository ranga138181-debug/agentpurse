import { sanitise } from "../sanitise";
import { productSchema, type Product, type ProductSearch } from "./product";

const SEARCH_LIMIT = 10;
const TEXT_FIELDS = ["title", "description", "merchant", "category"] as const;

function sanitiseProduct(result: unknown): unknown {
  if (result === null || typeof result !== "object") return result;
  const product: Record<string, unknown> = { ...result };
  for (const field of TEXT_FIELDS) {
    const value = product[field];
    if (typeof value === "string") product[field] = sanitise(value, field);
  }
  // Rule R-06 compares categories exactly, so they are lower-cased here.
  if (typeof product.category === "string") {
    product.category = product.category.toLowerCase();
  }
  return product;
}

export async function searchProducts(
  search: ProductSearch,
  query: string,
): Promise<Product[]> {
  const results = await search.search(query, SEARCH_LIMIT);
  return results.slice(0, SEARCH_LIMIT).flatMap((result) => {
    const parsed = productSchema.safeParse(sanitiseProduct(result));
    return parsed.success ? [parsed.data] : [];
  });
}
