import { expect, test } from "vitest";
import { createBoundary } from "@/agent/boundary";
import { sanitise } from "@/agent/sanitise";
import { searchProducts } from "@/agent/search";
import { createFixtureSearch } from "@/agent/search/fixture";

test.each([
  [
    "step 1 NFKC normalisation",
    "\uFF30\uFF48\uFF4F\uFF4E\uFF45 Case",
    "Phone Case",
  ],
  [
    "step 2 control characters",
    "Phone\u0000\u0007\u001F\u007F\u009F Case",
    "Phone Case",
  ],
  [
    "step 2 zero-width and bidirectional characters",
    "Pho\u200B\u200Fne\u202A\u202E \u2060\u2064\uFEFFCase",
    "Phone Case",
  ],
  ["step 3 a tag", "<b>Phone</b> Case", "Phone Case"],
  [
    "step 3 a tag with attributes",
    "<img src=x onerror=alert(1)> Phone Case",
    "Phone Case",
  ],
  ["step 3 stray angle brackets", "Phone > Case < Cover", "Phone Case Cover"],
  [
    "step 3 a full-width tag made real by NFKC",
    "\uFF1Cscript\uFF1EPhone Case",
    "Phone Case",
  ],
  ["step 3 an unclosed tag", "Phone Case <script", "Phone Case script"],
  ["step 5 whitespace runs", "  Phone \t\n   Case  ", "Phone Case"],
])("UT-AGT-011 sanitiser %s", (_name, input, expected) => {
  expect(sanitise(input, "title")).toBe(expected);
});

test("UT-AGT-011 sanitiser step 4 removes URLs from rationales only", () => {
  const text =
    "Great fit see https://evil.example/x?y=1 and http://a.b or www.c.d/e now";

  expect(sanitise(text, "rationale")).toBe("Great fit see and or now");
  expect(sanitise(text, "description")).toBe(text);
});

test.each([
  ["title", 120],
  ["description", 500],
  ["merchant", 80],
  ["category", 40],
  ["rationale", 280],
] as const)(
  "UT-AGT-011 sanitiser step 6 truncates %s to %i characters",
  (field, limit) => {
    expect(sanitise("x".repeat(limit + 50), field)).toBe("x".repeat(limit));
    expect(sanitise("x".repeat(limit), field)).toBe("x".repeat(limit));
  },
);

test.each([
  ["null", null],
  ["an empty string", ""],
  ["only whitespace", "  \n "],
  ["only markup", "<br><hr>"],
  ["only invisible characters", "\u200B\u0000"],
])("UT-AGT-011 sanitiser returns null for %s", (_name, input) => {
  expect(sanitise(input, "title")).toBeNull();
});

test("UT-AGT-011 the P-019 title becomes Phone Case at the search boundary", async () => {
  const [product] = await searchProducts(
    createFixtureSearch("2026-11-02"),
    "phone case",
  );

  expect(product.product_id).toBe("P-019");
  expect(product.title).toBe("Phone Case");
});

test("UT-AGT-011 product text from any source is sanitised and the category lower-cased", async () => {
  const source = {
    search: async () => [
      {
        product_id: "X-1",
        title: `<i>${"t".repeat(200)}</i>`,
        description: "A <b>bold</b> claim\u200B",
        merchant: " Some\tShop ",
        category: "Gift_Card",
        image_url: null,
        product_url: null,
        price_cents: 100,
        shipping_cents: 0,
        tax_cents: 0,
        currency: "USD",
        in_stock: true,
        estimated_delivery_date: null,
      },
    ],
  };

  const [product] = await searchProducts(source, "anything");

  expect(product).toMatchObject({
    title: "t".repeat(120),
    description: "A bold claim",
    merchant: "SomeShop",
    category: "gift_card",
  });
});

test("UT-AGT-011 the boundary token is regenerated until it occurs in no text", () => {
  const tokens = ["token-a", "token-b", "token-c"];
  const generate = () => tokens.shift() as string;

  const boundary = createBoundary(
    ["mentions token-a here", null, "and token-b there"],
    generate,
  );

  expect(boundary).toBe("token-c");
});

test("UT-AGT-011 a fresh boundary token is random per request", () => {
  const first = createBoundary(["text"]);
  const second = createBoundary(["text"]);

  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  expect(first).not.toBe(second);
});
