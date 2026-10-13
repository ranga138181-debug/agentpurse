import { afterEach, expect, test, vi } from "vitest";
import { fakeAdapter } from "@/agent/model/fake";
import { searchProducts } from "@/agent/search";
import { createChannel3Search, liveSearch } from "@/agent/search/channel3";
import { evaluateCandidate } from "@/policy/evaluate-candidate";
import { submitMandate } from "@/app/api/mandates/pipeline";
import { POST as submit } from "@/app/api/mandates/route";
import { createDeadline } from "@/lib/deadline";
import recorded from "./fixtures/channel3-search.json";
import { auditEvents, newCookie, post } from "./support";

const TODAY = "2026-11-02";
const CONSTRAINTS = {
  max_total_cents: 50000,
  currency: "USD",
  deliver_by: null,
  exclude_terms: [],
};

afterEach(() => vi.restoreAllMocks());

type Recorded = (typeof recorded.products)[number];

function respondWith(products: unknown[], status = 200) {
  return vi.fn(async (...args: Parameters<typeof fetch>) => {
    void args;
    return Response.json({ products, next_page_token: null }, { status });
  });
}

async function mapped(products: unknown[]) {
  const fetchFake = respondWith(products);
  const search = createChannel3Search("test-key", TODAY, fetchFake);
  return { products: await searchProducts(search, "earbuds"), fetchFake };
}

function withOffers(
  offers: Partial<Recorded["offers"][number]>[],
  overrides: Record<string, unknown> = {},
) {
  const [base] = recorded.products;
  return {
    ...base,
    ...overrides,
    offers: offers.map((offer) => ({ ...base.offers[0], ...offer })),
  };
}

const priced = (price: number, rest = {}) => ({
  price: { price, compare_at_price: null, currency: "USD" },
  ...rest,
});

test("IT-SRCH-001 the request goes to the Channel3 search endpoint with the key, query and limit", async () => {
  const { fetchFake } = await mapped(recorded.products);

  const [url, init] = fetchFake.mock.calls[0];
  expect(url).toBe("https://api.trychannel3.com/v1/search");
  expect(init?.method).toBe("POST");
  expect(new Headers(init?.headers).get("x-api-key")).toBe("test-key");
  expect(JSON.parse(init?.body as string)).toEqual({
    query: "earbuds",
    limit: 10,
  });
});

test("IT-SRCH-001 the recorded response maps to valid, sanitised products on demo-store terms", async () => {
  const { products } = await mapped(recorded.products);

  expect(products).toHaveLength(4);
  expect(products[0]).toEqual({
    product_id: "c3-i70eUCR",
    title: "Audio-Technica ATH-CKS50TW2 Wireless Earbuds",
    description: expect.any(String),
    merchant: "macys.com",
    category: "headphones",
    image_url: null,
    product_url: "https://buy.trychannel3.com/REDACTED",
    price_cents: 15900,
    shipping_cents: 0,
    tax_cents: 0,
    currency: "USD",
    in_stock: true,
    estimated_delivery_date: "2026-11-07",
  });
  expect(products[3]).toMatchObject({
    product_id: "c3-I95pCF8",
    merchant: "walmart.com",
    category: "mugs",
    price_cents: 1157,
    shipping_cents: 499,
  });
  for (const product of products) {
    expect(product.description!.length).toBeLessThanOrEqual(500);
    expect(evaluateCandidate(CONSTRAINTS, product).decision).toBeDefined();
  }
});

test("IT-SRCH-001 the first brand prefixes the title unless the title already names it", async () => {
  const { products } = await mapped([
    withOffers([priced(20)], { id: "a", title: "Yoga Mat" }),
    withOffers([priced(20)], { id: "b", title: "audio-technica M50x" }),
    withOffers([priced(20)], { id: "c", title: "Yoga Mat", brands: [] }),
    withOffers([priced(20)], {
      id: "d",
      title: "Yoga Mat",
      brands: [
        { id: "1", name: "Gaiam" },
        { id: "2", name: "Other" },
      ],
    }),
  ]);

  expect(products.map(({ title }) => title)).toEqual([
    "Audio-Technica Yoga Mat",
    "audio-technica M50x",
    "Yoga Mat",
    "Gaiam Yoga Mat",
  ]);
});

test("IT-SRCH-001 a restricted keyword in the title or category path sets the restricted group", async () => {
  const { products } = await mapped([
    ...recorded.products,
    withOffers([priced(20)], {
      id: "gc",
      title: "Store Voucher",
      category: {
        slug: "vouchers",
        title: "Vouchers",
        path: [{ slug: "gift-cards", title: "Gift Cards" }],
        has_children: false,
      },
    }),
    withOffers([priced(20)], { id: "drum", title: "Drumming Sexton Rumba" }),
  ]);

  const category = (id: string) =>
    products.find(({ product_id }) => product_id === `c3-${id}`)!.category;
  expect(category("yzxjsUZ")).toBe("alcohol");
  expect(category("o1zghKp")).toBe("alcohol");
  expect(category("gc")).toBe("gift_card");
  expect(category("drum")).toBe("headphones");
  expect(category("I95pCF8")).toBe("mugs");
  expect(
    evaluateCandidate(
      CONSTRAINTS,
      products.find(({ product_id }) => product_id === "c3-yzxjsUZ")!,
    ).reason_codes,
  ).toEqual(["RESTRICTED_CATEGORY"]);
});

test("IT-SRCH-001 the cheapest in-stock USD offer is used, otherwise the cheapest offer", async () => {
  const { products } = await mapped([
    withOffers(
      [
        priced(30, { domain: "a.example" }),
        priced(10, { domain: "b.example", availability: "OutOfStock" }),
        {
          domain: "c.example",
          price: { price: 5, compare_at_price: null, currency: "EUR" },
        },
        priced(20.5, { domain: "d.example" }),
      ],
      { id: "mixed" },
    ),
    withOffers(
      [
        priced(40, { domain: "e.example", availability: "OutOfStock" }),
        priced(35, { domain: "f.example", availability: "OutOfStock" }),
      ],
      { id: "sold-out" },
    ),
  ]);

  expect(products[0]).toMatchObject({
    merchant: "d.example",
    price_cents: 2050,
    shipping_cents: 499,
    in_stock: true,
  });
  expect(products[1]).toMatchObject({
    merchant: "f.example",
    price_cents: 3500,
    shipping_cents: 0,
    in_stock: false,
  });
  expect(evaluateCandidate(CONSTRAINTS, products[1]).reason_codes).toEqual([
    "OUT_OF_STOCK",
  ]);
});

test.each([
  [19.999, "more than two decimals"],
  [-5, "negative"],
  [Number.NaN, "not a number"],
  [1e21, "exponent notation"],
])(
  "IT-SRCH-001 a price of %s (%s) is null and blocks as incomplete",
  async (price) => {
    const { products } = await mapped([withOffers([priced(price)])]);

    expect(products[0]).toMatchObject({
      price_cents: null,
      shipping_cents: null,
    });
    expect(evaluateCandidate(CONSTRAINTS, products[0]).reason_codes).toEqual([
      "INCOMPLETE_PRODUCT_DATA",
    ]);
  },
);

test.each([
  [0, 0, 499],
  [5, 500, 499],
  [34.99, 3499, 499],
  [35, 3500, 0],
  [71.4, 7140, 0],
])(
  "IT-SRCH-001 a price of %s is %s cents with %s cents shipping",
  async (price, cents, shipping) => {
    const { products } = await mapped([withOffers([priced(price)])]);

    expect(products[0].price_cents).toBe(cents);
    expect(products[0].shipping_cents).toBe(shipping);
  },
);

test("IT-SRCH-001 a result with no offer has null price, currency, merchant and stock", async () => {
  const { products } = await mapped([withOffers([], { category: null })]);

  expect(products[0]).toMatchObject({
    product_id: "c3-i70eUCR",
    category: null,
    merchant: null,
    product_url: null,
    price_cents: null,
    shipping_cents: null,
    currency: null,
    in_stock: null,
  });
  expect(evaluateCandidate(CONSTRAINTS, products[0]).reason_codes).toEqual([
    "INCOMPLETE_PRODUCT_DATA",
  ]);
});

test("IT-SRCH-001 results that are not Channel3 products are dropped and markup is sanitised", async () => {
  const { products } = await mapped([
    { id: 7, title: "Wrong ID type" },
    "not an object",
    withOffers([priced(20)], {
      id: "x",
      title: "<img src=x onerror=alert(1)> Case",
    }),
  ]);

  expect(products).toHaveLength(1);
  expect(products[0].title).toBe("Audio-Technica Case");
});

test("IT-SRCH-001 an error status or a body without products throws", async () => {
  const failing = createChannel3Search("k", TODAY, respondWith([], 500));
  await expect(failing.search("earbuds", 10)).rejects.toThrow();

  const malformed = createChannel3Search("k", TODAY, async () =>
    Response.json({ items: [] }),
  );
  await expect(malformed.search("earbuds", 10)).rejects.toThrow();
});

function liveMandate(cookie: string, source: unknown = "live") {
  return submit(
    post("/api/mandates", cookie, {
      text: "Wireless earbuds, max $200",
      timezone: "America/New_York",
      source,
    }),
  );
}

test("IT-SRCH-002 a live mandate stores Channel3 candidates and records the provider", async () => {
  const fetchFake = respondWith(recorded.products);
  vi.stubGlobal("fetch", fetchFake);
  const cookie = await newCookie();

  const response = await liveMandate(cookie);
  vi.unstubAllGlobals();
  const mandate = await response.json();

  expect(response.status).toBe(201);
  expect(mandate.status).toBe("PROPOSED");
  expect(
    mandate.candidates.map((c: { product_id: string }) => c.product_id),
  ).toEqual(["c3-i70eUCR", "c3-yzxjsUZ", "c3-o1zghKp", "c3-I95pCF8"]);
  expect(mandate.candidates[0]).toMatchObject({
    merchant: "macys.com",
    total_cents: 15900,
    decision: "ALLOW",
  });
  expect(mandate.candidates[1]).toMatchObject({
    decision: "BLOCK",
    reason_codes: ["RESTRICTED_CATEGORY"],
  });
  const events = await auditEvents(cookie, mandate.id);
  const search = events.find(
    (event: { event_type: string }) => event.event_type === "SEARCH_COMPLETED",
  );
  expect(search!.payload.provider).toBe("channel3");
  expect(
    new Headers(fetchFake.mock.calls[0][1]?.headers).get("x-api-key"),
  ).toBe(process.env.CHANNEL3_API_KEY);
});

test("IT-SRCH-002 the demo source is the default and never calls Channel3", async () => {
  const fetchFake = respondWith(recorded.products);
  vi.stubGlobal("fetch", fetchFake);
  const cookie = await newCookie();

  const explicit = await liveMandate(cookie, "demo");
  const omitted = await submit(
    post("/api/mandates", cookie, {
      text: "Wireless earbuds, max $200",
      timezone: "America/New_York",
    }),
  );
  vi.unstubAllGlobals();

  expect(explicit.status).toBe(201);
  expect(omitted.status).toBe(201);
  expect(fetchFake.mock.calls.map(([url]) => String(url))).toEqual([]);
});

test("IT-SRCH-002 a Channel3 failure ends in 503 SEARCH_UNAVAILABLE with no pick", async () => {
  vi.stubGlobal("fetch", respondWith([], 500));
  const cookie = await newCookie();

  const response = await liveMandate(cookie);
  vi.unstubAllGlobals();
  const body = await response.json();

  expect(response.status).toBe(503);
  expect(body.error.code).toBe("SEARCH_UNAVAILABLE");
  const events = await auditEvents(cookie, body.error.details.mandate_id);
  expect(
    events.map((event: { event_type: string }) => event.event_type),
  ).not.toContain("PICK_PROPOSED");
});

test("IT-SRCH-002 without a Channel3 key a live mandate ends in 503 SEARCH_UNAVAILABLE", async () => {
  const fetchFake = respondWith(recorded.products);
  vi.stubGlobal("fetch", fetchFake);
  const cookie = await newCookie();

  const response = await submitMandate(
    {
      text: "Wireless earbuds, max $200",
      timezone: "America/New_York",
      sessionId: cookie.slice("ap_session=".length).split(".")[0],
      now: new Date(),
      requestId: crypto.randomUUID(),
      deadline: createDeadline(12_000),
    },
    { adapter: fakeAdapter, dailyCap: 1_000_000, ...liveSearch(undefined) },
  );
  vi.unstubAllGlobals();

  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("SEARCH_UNAVAILABLE");
  expect(fetchFake).not.toHaveBeenCalled();
});

test("IT-SRCH-002 an unknown source is rejected with 400", async () => {
  const response = await liveMandate(await newCookie(), "web");

  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
});
