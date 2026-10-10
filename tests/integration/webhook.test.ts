import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as webhook } from "@/app/api/webhooks/paypal/route";
import { db } from "@/db/client";
import { mandates, orders, webhookEvents } from "@/db/schema";
import {
  VERIFY,
  approvedMandate,
  auditEvents,
  fakePayPal,
  newCookie,
  origin,
  post,
} from "./support";

afterEach(() => vi.restoreAllMocks());

const transmissionHeaders = {
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-time": "2026-11-02T17:00:00Z",
  "paypal-transmission-sig": "signature",
  "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
  "paypal-auth-algo": "SHA256withRSA",
};

async function createdOrder() {
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  const response = await createOrder(
    post(
      "/api/orders",
      cookie,
      { mandate_id: mandateId },
      { "idempotency-key": crypto.randomUUID() },
    ),
  );
  return { cookie, mandateId, order: await response.json() };
}

function captureEvent(
  paypalOrderId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `WH-${crypto.randomUUID()}`,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: `CAP-${crypto.randomUUID()}`,
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "29.98" },
      supplementary_data: { related_ids: { order_id: paypalOrderId } },
    },
    ...overrides,
  };
}

async function deliver(
  body: string,
  headers: Record<string, string> = transmissionHeaders,
) {
  const response = await webhook(
    new Request(`${origin}/api/webhooks/paypal`, {
      method: "POST",
      headers,
      body,
    }),
  );
  return { response, body: await response.json() };
}

async function state(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  const [mandate] = await db
    .select()
    .from(mandates)
    .where(eq(mandates.id, order.mandate_id));
  return { order, mandate };
}

test("IT-PAY-005 a verified PAYMENT.CAPTURE.COMPLETED reconciles a CREATED order", async () => {
  const paypal = fakePayPal();
  const { cookie, mandateId, order } = await createdOrder();
  const event = captureEvent(order.paypal_order_id);
  const raw = JSON.stringify(event, null, 2);

  const { response, body } = await deliver(raw);

  expect(response.status).toBe(200);
  expect(body).toEqual({ received: true });
  const after = await state(order.id);
  expect(after.order).toMatchObject({
    status: "CAPTURED",
    paypal_capture_id: event.resource.id,
  });
  expect(after.mandate.status).toBe("SETTLED");
  expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
    event_type: "WEBHOOK_RECEIVED",
    actor: "PAYMENT",
    payload: { order_id: order.id, paypal_order_id: order.paypal_order_id },
  });
  const [verify] = paypal.callsTo(VERIFY);
  expect(verify.body).toMatchObject({
    auth_algo: "SHA256withRSA",
    cert_url: "https://api.sandbox.paypal.com/cert.pem",
    transmission_id: "tx-1",
    transmission_sig: "signature",
    transmission_time: "2026-11-02T17:00:00Z",
    webhook_id: "WH-TEST",
    webhook_event: event,
  });
  expect(verify.text.endsWith(`"webhook_event":${raw}}`)).toBe(true);
});

test("IT-PAY-005 a duplicate event ID returns 200 and changes nothing", async () => {
  fakePayPal();
  const { cookie, mandateId, order } = await createdOrder();
  const raw = JSON.stringify(captureEvent(order.paypal_order_id));
  await deliver(raw);
  const eventsAfterFirst = await auditEvents(cookie, mandateId);
  const stateAfterFirst = await state(order.id);

  const { response, body } = await deliver(raw);

  expect(response.status).toBe(200);
  expect(body).toEqual({ received: true });
  expect(await auditEvents(cookie, mandateId)).toEqual(eventsAfterFirst);
  expect(await state(order.id)).toEqual(stateAfterFirst);
});

test("IT-PAY-005 an unhandled event type is acknowledged and recorded but changes nothing", async () => {
  fakePayPal();
  const { cookie, mandateId, order } = await createdOrder();
  const event = captureEvent(order.paypal_order_id, {
    event_type: "CHECKOUT.ORDER.APPROVED",
  });
  const eventsBefore = await auditEvents(cookie, mandateId);

  const { response, body } = await deliver(JSON.stringify(event));

  expect(response.status).toBe(200);
  expect(body).toEqual({ received: true });
  expect((await state(order.id)).order.status).toBe("CREATED");
  expect(await auditEvents(cookie, mandateId)).toEqual(eventsBefore);
  expect(
    await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.paypal_event_id, event.id)),
  ).toHaveLength(1);
});

test("IT-PAY-005 a verified PAYMENT.CAPTURE.DENIED marks a CREATED order FAILED", async () => {
  fakePayPal();
  const { cookie, mandateId, order } = await createdOrder();
  const event = captureEvent(order.paypal_order_id, {
    event_type: "PAYMENT.CAPTURE.DENIED",
  });

  const { response } = await deliver(JSON.stringify(event));

  expect(response.status).toBe(200);
  const after = await state(order.id);
  expect(after.order).toMatchObject({
    status: "FAILED",
    paypal_capture_id: null,
  });
  expect(after.mandate.status).toBe("APPROVED");
  expect((await auditEvents(cookie, mandateId)).at(-1)?.event_type).toBe(
    "WEBHOOK_RECEIVED",
  );
});

test.each([
  ["a different amount", { currency_code: "USD", value: "0.01" }],
  ["a different currency", { currency_code: "EUR", value: "29.98" }],
])(
  "IT-PAY-005 a completed capture with %s is acknowledged but does not capture the order",
  async (_name, amount) => {
    fakePayPal();
    const { cookie, mandateId, order } = await createdOrder();
    const event = captureEvent(order.paypal_order_id);
    event.resource.amount = amount;
    const eventsBefore = await auditEvents(cookie, mandateId);

    const { response } = await deliver(JSON.stringify(event));

    expect(response.status).toBe(200);
    const after = await state(order.id);
    expect(after.order.status).toBe("CREATED");
    expect(after.mandate.status).toBe("APPROVED");
    expect(await auditEvents(cookie, mandateId)).toEqual(eventsBefore);
  },
);

test("IT-PAY-005 an event for an unknown PayPal order is acknowledged", async () => {
  fakePayPal();

  const { response, body } = await deliver(
    JSON.stringify(captureEvent("PP-unknown")),
  );

  expect(response.status).toBe(200);
  expect(body).toEqual({ received: true });
});

test("IT-PAY-005 a webhook does not change an order that is already CAPTURED", async () => {
  fakePayPal();
  const { order } = await createdOrder();
  await deliver(JSON.stringify(captureEvent(order.paypal_order_id)));
  const captured = await state(order.id);

  await deliver(
    JSON.stringify(
      captureEvent(order.paypal_order_id, {
        event_type: "PAYMENT.CAPTURE.DENIED",
      }),
    ),
  );

  expect(await state(order.id)).toEqual(captured);
});

test.each(["FAILURE", "", "success"])(
  "IT-PAY-008 a verification status of %j returns 400 WEBHOOK_SIGNATURE_INVALID and changes nothing",
  async (verification_status) => {
    fakePayPal({
      [VERIFY]: () => ({ status: 200, body: { verification_status } }),
    });
    const { cookie, mandateId, order } = await createdOrder();
    const event = captureEvent(order.paypal_order_id);
    const eventsBefore = await auditEvents(cookie, mandateId);

    const { response, body } = await deliver(JSON.stringify(event));

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    const after = await state(order.id);
    expect(after.order.status).toBe("CREATED");
    expect(after.mandate.status).toBe("APPROVED");
    expect(await auditEvents(cookie, mandateId)).toEqual(eventsBefore);
    expect(
      await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.paypal_event_id, event.id)),
    ).toEqual([]);
  },
);

test.each(Object.keys(transmissionHeaders))(
  "IT-PAY-008 a webhook without the %s header returns 400 and is not sent for verification",
  async (missing) => {
    const paypal = fakePayPal();
    const { order } = await createdOrder();
    const headers: Record<string, string> = { ...transmissionHeaders };
    delete headers[missing];

    const { response, body } = await deliver(
      JSON.stringify(captureEvent(order.paypal_order_id)),
      headers,
    );

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(paypal.callsTo(VERIFY)).toEqual([]);
    expect((await state(order.id)).order.status).toBe("CREATED");
  },
);

test("IT-PAY-008 a body that is not JSON returns 400 and is not sent for verification", async () => {
  const paypal = fakePayPal();

  const { response } = await deliver("not json");

  expect(response.status).toBe(400);
  expect(paypal.callsTo(VERIFY)).toEqual([]);
});

test("IT-PAY-008 a 4xx from the verification call is treated as an invalid signature", async () => {
  fakePayPal({ [VERIFY]: () => ({ status: 400, body: {} }) });
  const { order } = await createdOrder();

  const { response, body } = await deliver(
    JSON.stringify(captureEvent(order.paypal_order_id)),
  );

  expect(response.status).toBe(400);
  expect(body.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
  expect((await state(order.id)).order.status).toBe("CREATED");
});

test.each([
  ["a 5xx", () => ({ status: 503, body: {} })],
  ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
])(
  "IT-PAY-008 %s from the verification call returns 502 and changes nothing",
  async (_name, handler) => {
    fakePayPal({ [VERIFY]: handler });
    const { order } = await createdOrder();
    const event = captureEvent(order.paypal_order_id);

    const { response, body } = await deliver(JSON.stringify(event));

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("PAYMENT_PROVIDER_ERROR");
    expect((await state(order.id)).order.status).toBe("CREATED");
    expect(
      await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.paypal_event_id, event.id)),
    ).toEqual([]);
  },
);

test("IT-SEC-006 the webhook endpoint needs no Origin header and issues no session", async () => {
  fakePayPal();
  const { order } = await createdOrder();

  const { response } = await deliver(
    JSON.stringify(captureEvent(order.paypal_order_id)),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("Set-Cookie")).toBeNull();
});
