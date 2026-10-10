import type { ModelAdapter } from "./adapter";

// The agent layer may import only types from the policy engine, so the fake carries its own amount-token pattern.
const AMOUNT_TOKEN =
  /(?:us\$|\$|€|£)\s?[\d,.]*\d|\d[\d,.]*\s?(?:usd|dollars?|bucks|euros?|eur|gbp|pounds?)\b/gi;

export const fakeAdapter: ModelAdapter = {
  async parseMandate({ text }) {
    return {
      query: text.toLowerCase().replace(AMOUNT_TOKEN, "").slice(0, 80),
      deliver_by: null,
      exclude_terms: [],
    };
  },
  async rankProducts({ products }) {
    return {
      ranking: products.map(({ product_id }) => ({
        product_id,
        rationale: "Fake ranking",
      })),
    };
  },
};
