import { z } from "zod";
import { addDays } from "../dates";
import type { ProductSearch } from "./product";

const SEARCH_URL = "https://api.trychannel3.com/v1/search";
const LIVE_SEARCH_TIMEOUT_MS = 5000;

// Demo-store terms: AgentPurse is the sandbox merchant of record (05-AGENT-SPEC section 4.4).
const SHIPPING_CENTS = 499;
const FREE_SHIPPING_FROM_CENTS = 3500;
const DELIVERY_DAYS = 5;
export const LIVE_TERMS =
  "Live products are sold on demo-store terms: $4.99 shipping (free from $35.00), no tax, delivery in 5 days.";

const RESTRICTED_KEYWORDS: Record<string, string[]> = {
  alcohol: [
    "wine",
    "beer",
    "whiskey",
    "whisky",
    "vodka",
    "liquor",
    "champagne",
    "tequila",
    "spirits",
  ],
  tobacco: ["tobacco", "cigarette", "cigar", "vape", "nicotine"],
  weapons: ["firearm", "gun", "rifle", "pistol", "ammunition", "ammo"],
  adult: ["erotic", "sex"],
  pharmacy: ["prescription", "pharmacy", "medication"],
  gift_card: ["gift card", "gift certificate"],
};

const RESTRICTED = Object.entries(RESTRICTED_KEYWORDS).map(
  ([group, keywords]) => ({
    group,
    pattern: new RegExp(`\\b(?:${keywords.join("|")})s?\\b`),
  }),
);

const offerSchema = z.object({
  url: z.string(),
  domain: z.string(),
  price: z.object({ price: z.unknown(), currency: z.string() }),
  availability: z.string(),
});

const resultSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  category: z
    .object({
      title: z.string(),
      path: z.array(z.object({ slug: z.string(), title: z.string() })),
    })
    .nullish(),
  offers: z.array(offerSchema),
});

const responseSchema = z.object({ products: z.array(z.unknown()) });

type Result = z.infer<typeof resultSchema>;

// Works on the number's decimal text, so no floating-point arithmetic touches the amount.
function toCents(price: unknown): number | null {
  if (typeof price !== "number") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(price));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function chooseOffer(offers: Result["offers"]) {
  const priced = offers.map((offer) => ({
    ...offer,
    cents: toCents(offer.price.price),
    buyable: offer.availability === "InStock" && offer.price.currency === "USD",
  }));
  const cheapest = (candidates: typeof priced) =>
    candidates
      .filter(({ cents }) => cents !== null)
      .reduce<(typeof priced)[number] | undefined>(
        (best, offer) =>
          best && (best.cents as number) <= (offer.cents as number)
            ? best
            : offer,
        undefined,
      );
  return (
    cheapest(priced.filter(({ buyable }) => buyable)) ??
    cheapest(priced) ??
    priced[0]
  );
}

function categoryOf({ title, category }: Result): string | null {
  const text = [
    title,
    ...(category?.path ?? []).flatMap((part) => [part.slug, part.title]),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  const restricted = RESTRICTED.find(({ pattern }) => pattern.test(text));
  return restricted?.group ?? category?.title ?? null;
}

function toProduct(result: Result, today: string) {
  const offer = chooseOffer(result.offers);
  const price_cents = offer?.cents ?? null;
  return {
    product_id: `c3-${result.id}`,
    title: result.title,
    description: result.description ?? null,
    merchant: offer?.domain ?? null,
    category: categoryOf(result),
    image_url: null,
    product_url: offer?.url.startsWith("https://") ? offer.url : null,
    price_cents,
    shipping_cents:
      price_cents === null
        ? null
        : price_cents < FREE_SHIPPING_FROM_CENTS
          ? SHIPPING_CENTS
          : 0,
    tax_cents: 0,
    currency: offer?.price.currency ?? null,
    in_stock: offer ? offer.availability === "InStock" : null,
    estimated_delivery_date: addDays(today, DELIVERY_DAYS),
  };
}

export function createChannel3Search(
  apiKey: string,
  today: string,
  fetchFn: typeof fetch = fetch,
): ProductSearch {
  return {
    async search(query, limit) {
      const response = await fetchFn(SEARCH_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit }),
        signal: AbortSignal.timeout(LIVE_SEARCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Channel3 search failed with ${response.status}`);
      }
      const { products } = responseSchema.parse(await response.json());
      return products.flatMap((product) => {
        const result = resultSchema.safeParse(product);
        return result.success ? [toProduct(result.data, today)] : [];
      });
    },
  };
}

export function liveSearch(apiKey: string | undefined) {
  return {
    searchProvider: "channel3",
    searchTimeoutMs: LIVE_SEARCH_TIMEOUT_MS,
    createSearch(today: string): ProductSearch {
      if (!apiKey) throw new Error("No Channel3 key is configured");
      return createChannel3Search(apiKey, today);
    },
  };
}
