import { expect, test } from "vitest";
import { createPayPalClient } from "@/payment/paypal";

// Calls the real sandbox, so it runs only where it is asked for; other tests use a fake network.
test.skipIf(process.env.PAYPAL_CONTRACT_TEST !== "1")(
  "IT-PAY-010 the real sandbox issues a token, creates an order idempotently and returns it",
  { timeout: 30000 },
  async () => {
    const paypal = createPayPalClient({
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID!,
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET!,
      fetch,
      now: Date.now,
    });
    const order = {
      requestId: crypto.randomUUID(),
      mandateId: crypto.randomUUID(),
      orderId: crypto.randomUUID(),
      currency: "USD",
      priceCents: 2499,
      shippingCents: 499,
      taxCents: 0,
    };

    const created = await paypal.createOrder(order);
    const repeated = await paypal.createOrder(order);
    const fetched = await paypal.getOrder(created.id);

    expect(created.id).toMatch(/\S/);
    expect(repeated.id).toBe(created.id);
    expect(fetched).toEqual({
      status: "CREATED",
      currency_code: "USD",
      value: "29.98",
    });
  },
);
