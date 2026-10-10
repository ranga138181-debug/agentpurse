import { productSchema, type Product, type ProductSearch } from "./product";

const SEARCH_LIMIT = 10;

export async function searchProducts(
  search: ProductSearch,
  query: string,
): Promise<Product[]> {
  const results = await search.search(query, SEARCH_LIMIT);
  return results.slice(0, SEARCH_LIMIT).flatMap((result) => {
    const parsed = productSchema.safeParse(result);
    return parsed.success ? [parsed.data] : [];
  });
}
