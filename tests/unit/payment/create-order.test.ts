import { expect, test, vi } from "vitest";
import {
  PaymentProviderError,
  createPayPalClient,
  formatAmount,
} from "@/payment/paypal";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function client(orderResponse: () => Response | Promise<Response>) {
  let clock = 0;
  const fetchMock = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith("/v1/oauth2/token")
      ? json(200, { access_token: "token-1", expires_in: 3600 })
      : orderResponse(),
  );
  const paypal = createPayPalClient({
    PAYPAL_ENV: "sandbox",
    PAYPAL_CLIENT_ID: "client",
    PAYPAL_CLIENT_SECRET: "secret",
    fetch: fetchMock as typeof fetch,
    now: () => clock,
  });
  return { paypal, fetchMock, advance: (ms: number) => (clock += ms) };
}

const order = {
  requestId: "5f0c2d5e-2f4a-4c6b-8d9e-0a1b2c3d4e5f",
  mandateId: "mandate-1",
  orderId: "order-1",
  currency: "USD",
  priceCents: 2499,
  shippingCents: 499,
  taxCents: 0,
};

test.each([
  [0, "0.00"],
  [5, "0.05"],
  [2998, "29.98"],
  [4000, "40.00"],
  [50000, "500.00"],
])("UT-PAY-002 %i cents is formatted as %s", (cents, value) => {
  expect(formatAmount(cents)).toBe(value);
});

test("UT-PAY-002 the order request carries the exact total and a breakdown that sums to it", async () => {
  const { paypal, fetchMock } = client(() => json(201, { id: "PP-1" }));

  const created = await paypal.createOrder({ ...order, taxCents: 2 });

  expect(created).toEqual({ id: "PP-1" });
  const [url, init] = fetchMock.mock.calls[1] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
  expect(init.method).toBe("POST");
  expect(init.headers).toMatchObject({
    Authorization: "Bearer token-1",
    "PayPal-Request-Id": order.requestId,
  });
  const usd = (value: string) => ({ currency_code: "USD", value });
  expect(JSON.parse(init.body as string)).toEqual({
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "mandate-1",
        custom_id: "order-1",
        amount: {
          ...usd("30.00"),
          breakdown: {
            item_total: usd("24.99"),
            shipping: usd("4.99"),
            tax_total: usd("0.02"),
          },
        },
      },
    ],
  });
});

test("UT-PAY-002 the access token is requested with basic credentials and reused until it nears expiry", async () => {
  const { paypal, fetchMock, advance } = client(() =>
    json(201, { id: "PP-1" }),
  );
  const tokenCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/token"));

  await paypal.createOrder(order);
  await paypal.createOrder(order);
  expect(tokenCalls()).toHaveLength(1);
  const [, init] = tokenCalls()[0] as unknown as [string, RequestInit];
  expect(init.headers).toMatchObject({
    Authorization: `Basic ${btoa("client:secret")}`,
  });
  expect(init.body).toBe("grant_type=client_credentials");

  advance(3600 * 1000 - 59_000);
  await paypal.createOrder(order);
  expect(tokenCalls()).toHaveLength(2);
});

test.each([
  ["a 5xx response", () => json(503, { debug_id: "dbg-1" })],
  ["a 4xx response", () => json(422, { name: "UNPROCESSABLE_ENTITY" })],
  ["a success without an order ID", () => json(201, {})],
  ["a body that is not JSON", () => new Response("<html>", { status: 201 })],
  ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
])("UT-PAY-002 %s raises a provider error", async (_name, response) => {
  const { paypal } = client(response);

  await expect(paypal.createOrder(order)).rejects.toBeInstanceOf(
    PaymentProviderError,
  );
});

test("UT-PAY-002 a provider error carries PayPal's debug ID and no credentials", async () => {
  const { paypal } = client(() => json(503, { debug_id: "dbg-1" }));

  const error = await paypal.createOrder(order).catch((caught) => caught);

  expect(error.debugId).toBe("dbg-1");
  expect(JSON.stringify(error) + error.message).not.toContain("secret");
});
