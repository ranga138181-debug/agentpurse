import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { POST as decide } from "@/app/api/mandates/[id]/approval/route";
import { GET as readMandate } from "@/app/api/mandates/[id]/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { db } from "@/db/client";
import { candidates, orders } from "@/db/schema";
import {
  approvedMandate,
  auditEvents,
  fakePayPal,
  newCookie,
  origin,
  post,
  proposedMandate,
} from "./support";

afterEach(() => vi.restoreAllMocks());

async function order(
  cookie: string,
  body: unknown,
  headers: Record<string, string> = {
    "idempotency-key": crypto.randomUUID(),
  },
) {
  const response = await createOrder(
    post("/api/orders", cookie, body, headers),
  );
  return { response, body: await response.json() };
}

const storedOrders = (mandateId: string) =>
  db.select().from(orders).where(eq(orders.mandate_id, mandateId));

test("IT-PAY-001 an approved mandate creates a PayPal order for the exact stored total", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId, candidateId } = await approvedMandate(cookie);
  const key = crypto.randomUUID();

  const { response, body } = await order(
    cookie,
    { mandate_id: mandateId },
    { "idempotency-key": key },
  );

  expect(response.status).toBe(201);
  expect(body).toMatchObject({
    mandate_id: mandateId,
    candidate_id: candidateId,
    amount_cents: 2998,
    currency: "USD",
    status: "CREATED",
    paypal_capture_id: null,
  });
  const [request] = paypal.orderCalls();
  expect(request.key).toBe("POST /v2/checkout/orders");
  expect(request.headers["PayPal-Request-Id"]).toBe(key);
  expect(request.body).toMatchObject({
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: mandateId,
        custom_id: body.id,
        amount: {
          currency_code: "USD",
          value: "29.98",
          breakdown: {
            item_total: { currency_code: "USD", value: "24.99" },
            shipping: { currency_code: "USD", value: "4.99" },
            tax_total: { currency_code: "USD", value: "0.00" },
          },
        },
      },
    ],
  });
  const [stored] = await storedOrders(mandateId);
  expect(stored).toMatchObject({
    id: body.id,
    status: "CREATED",
    amount_cents: 2998,
    paypal_order_id: body.paypal_order_id,
  });
  expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
    event_type: "ORDER_CREATED",
    actor: "PAYMENT",
    decision: "ALLOW",
    payload: {
      order_id: body.id,
      paypal_order_id: body.paypal_order_id,
      total_cents: 2998,
    },
  });
  const read = await readMandate(
    new Request(`${origin}/api/mandates/${mandateId}`, { headers: { cookie } }),
    { params: Promise.resolve({ id: mandateId }) },
  );
  expect((await read.json()).order).toEqual(body);
});

test.each([
  ["proposed", async () => {}],
  [
    "declined",
    async (cookie: string, mandateId: string) => {
      await decide(
        post(`/api/mandates/${mandateId}/approval`, cookie, {
          decision: "DECLINE",
        }),
        { params: Promise.resolve({ id: mandateId }) },
      );
    },
  ],
])(
  "IT-PAY-001 a %s mandate returns 409 MANDATE_NOT_APPROVED without calling PayPal",
  async (_name, prepare) => {
    const paypal = fakePayPal();
    const cookie = await newCookie();
    const { mandate } = await proposedMandate(cookie, "Gift for mom, max $40");
    await prepare(cookie, mandate.id);

    const { response, body } = await order(cookie, { mandate_id: mandate.id });

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({
      code: "INVALID_STATE",
      details: { reason: "MANDATE_NOT_APPROVED" },
    });
    expect(paypal.calls).toEqual([]);
    expect(await storedOrders(mandate.id)).toEqual([]);
    expect((await auditEvents(cookie, mandate.id)).at(-1)).toMatchObject({
      event_type: "ORDER_BLOCKED",
      actor: "POLICY",
      decision: "BLOCK",
      reason_codes: ["MANDATE_NOT_APPROVED"],
    });
  },
);

test("IT-PAY-001 an order-time policy block returns 409 POLICY_BLOCKED without calling PayPal", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId, candidateId } = await approvedMandate(cookie);
  // Candidates are immutable through the API; this simulates a snapshot that no longer passes.
  await db
    .update(candidates)
    .set({ in_stock: false })
    .where(eq(candidates.id, candidateId));

  const { response, body } = await order(cookie, { mandate_id: mandateId });

  expect(response.status).toBe(409);
  expect(body.error).toMatchObject({
    code: "POLICY_BLOCKED",
    details: { reason_codes: ["OUT_OF_STOCK"] },
  });
  expect(paypal.calls).toEqual([]);
  expect(await storedOrders(mandateId)).toEqual([]);
  expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
    event_type: "ORDER_BLOCKED",
    reason_codes: ["OUT_OF_STOCK"],
  });
});

test.each([
  ["a 5xx from PayPal", () => ({ status: 503, body: { debug_id: "dbg" } })],
  ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
])(
  "IT-PAY-001 %s returns 502 PAYMENT_PROVIDER_ERROR and stores no order",
  async (_name, handler) => {
    fakePayPal({ "POST /v2/checkout/orders": handler });
    const cookie = await newCookie();
    const { mandateId } = await approvedMandate(cookie);

    const { response, body } = await order(cookie, { mandate_id: mandateId });

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("PAYMENT_PROVIDER_ERROR");
    expect(await storedOrders(mandateId)).toEqual([]);
  },
);

test("IT-PAY-007 an extra amount field returns 400 and PayPal is not called", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);

  const { response, body } = await order(cookie, {
    mandate_id: mandateId,
    amount: "0.01",
  });

  expect(response.status).toBe(400);
  expect(body.error).toMatchObject({
    code: "VALIDATION_ERROR",
    details: { fields: ["amount"] },
  });
  expect(paypal.calls).toEqual([]);
  expect(await storedOrders(mandateId)).toEqual([]);
});

test.each([
  ["an amount_cents field", { amount_cents: 1 }],
  ["a candidate_id field", { candidate_id: crypto.randomUUID() }],
  ["a currency field", { currency: "EUR" }],
])("IT-PAY-007 %s is rejected with 400", async (_name, extra) => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);

  const { response } = await order(cookie, { mandate_id: mandateId, ...extra });

  expect(response.status).toBe(400);
  expect(paypal.calls).toEqual([]);
});

test("IT-SEC-002 another session gets 404 when ordering this session's mandate", async () => {
  const paypal = fakePayPal();
  const { mandateId } = await approvedMandate(await newCookie());

  const { response, body } = await order(await newCookie(), {
    mandate_id: mandateId,
  });

  expect(response.status).toBe(404);
  expect(body.error.code).toBe("NOT_FOUND");
  expect(paypal.calls).toEqual([]);
});

test.each([
  ["a bad mandate UUID", { mandate_id: "nope" }],
  ["a missing mandate_id", {}],
])("IT-SEC-004 the order endpoint rejects %s with 400", async (_name, body) => {
  fakePayPal();

  const { response } = await order(await newCookie(), body);

  expect(response.status).toBe(400);
});

test("IT-SEC-006 an order POST with a foreign Origin is rejected with 403", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);

  const { response } = await order(
    cookie,
    { mandate_id: mandateId },
    { origin: "https://evil.example", "idempotency-key": crypto.randomUUID() },
  );

  expect(response.status).toBe(403);
});
