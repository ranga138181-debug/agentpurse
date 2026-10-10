import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { POST as capture } from "@/app/api/orders/[id]/capture/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { db } from "@/db/client";
import { idempotencyKeys, mandates, orders } from "@/db/schema";
import {
  CAPTURE,
  GET_ORDER,
  approvedMandate,
  auditEvents,
  fakePayPal,
  newCookie,
  post,
} from "./support";

afterEach(() => vi.restoreAllMocks());

async function createdOrder(cookie: string) {
  const { mandateId } = await approvedMandate(cookie);
  const response = await createOrder(
    post(
      "/api/orders",
      cookie,
      { mandate_id: mandateId },
      { "idempotency-key": crypto.randomUUID() },
    ),
  );
  const order = await response.json();
  return { mandateId, orderId: order.id as string, order };
}

async function captureOrder(
  cookie: string,
  orderId: string,
  key: string | undefined = crypto.randomUUID(),
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  const response = await capture(
    post(`/api/orders/${orderId}/capture`, cookie, body, {
      ...(key === undefined ? {} : { "idempotency-key": key }),
      ...headers,
    }),
    { params: Promise.resolve({ id: orderId }) },
  );
  return { response, body: await response.json() };
}

async function stored(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  const [mandate] = await db
    .select()
    .from(mandates)
    .where(eq(mandates.id, order.mandate_id));
  return { order, mandate };
}

const approvedOrder = (overrides: object) => (amount: unknown) => ({
  status: 200,
  body: { status: "APPROVED", purchase_units: [{ amount }], ...overrides },
});

test("IT-PAY-002 a successful capture marks the order CAPTURED and the mandate SETTLED", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId, orderId, order } = await createdOrder(cookie);
  const key = crypto.randomUUID();

  const { response, body } = await captureOrder(cookie, orderId, key);

  expect(response.status).toBe(200);
  expect(body).toMatchObject({
    id: orderId,
    mandate_id: mandateId,
    paypal_order_id: order.paypal_order_id,
    amount_cents: 2998,
    currency: "USD",
    status: "CAPTURED",
  });
  expect(body.paypal_capture_id).toMatch(/^CAP-/);
  const state = await stored(orderId);
  expect(state.order).toMatchObject({
    status: "CAPTURED",
    paypal_capture_id: body.paypal_capture_id,
  });
  expect(state.mandate.status).toBe("SETTLED");
  expect(paypal.callsTo(CAPTURE)[0].headers["PayPal-Request-Id"]).toBe(key);
  expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
    event_type: "ORDER_CAPTURED",
    actor: "PAYMENT",
    decision: "ALLOW",
    payload: {
      order_id: orderId,
      paypal_order_id: order.paypal_order_id,
      total_cents: 2998,
    },
  });
});

test.each([
  [
    "a 422 from PayPal",
    () => ({ status: 422, body: { name: "UNPROCESSABLE_ENTITY" } }),
  ],
  [
    "a capture with status DECLINED",
    () => ({
      status: 201,
      body: {
        purchase_units: [
          { payments: { captures: [{ id: "CAP-x", status: "DECLINED" }] } },
        ],
      },
    }),
  ],
])(
  "IT-PAY-002 %s marks the order FAILED and leaves the mandate APPROVED",
  async (_name, handler) => {
    fakePayPal({ [CAPTURE]: handler });
    const cookie = await newCookie();
    const { mandateId, orderId } = await createdOrder(cookie);

    const { response, body } = await captureOrder(cookie, orderId);

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("PAYMENT_PROVIDER_ERROR");
    const state = await stored(orderId);
    expect(state.order).toMatchObject({
      status: "FAILED",
      paypal_capture_id: null,
    });
    expect(state.mandate.status).toBe("APPROVED");
    expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
      event_type: "ORDER_FAILED",
      actor: "PAYMENT",
    });
  },
);

test.each([
  ["a 5xx", () => ({ status: 503, body: { debug_id: "dbg" } })],
  ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
  [
    "a pending capture",
    () => ({
      status: 201,
      body: {
        purchase_units: [
          { payments: { captures: [{ id: "CAP-x", status: "PENDING" }] } },
        ],
      },
    }),
  ],
])(
  "IT-PAY-002 %s from PayPal returns 502 and leaves the order CREATED",
  async (_name, handler) => {
    fakePayPal({ [CAPTURE]: handler });
    const cookie = await newCookie();
    const { orderId } = await createdOrder(cookie);

    const { response, body } = await captureOrder(cookie, orderId);

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("PAYMENT_PROVIDER_ERROR");
    const state = await stored(orderId);
    expect(state.order.status).toBe("CREATED");
    expect(state.mandate.status).toBe("APPROVED");
  },
);

test("IT-AUD-001 a full approved purchase yields the specified audit event sequence", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { mandateId, orderId } = await createdOrder(cookie);

  await captureOrder(cookie, orderId);

  const events = await auditEvents(cookie, mandateId);
  expect(events.map((event) => event.event_type)).toEqual([
    "MANDATE_RECEIVED",
    "MANDATE_PARSED",
    "SEARCH_COMPLETED",
    ...Array(10).fill("POLICY_DECISION"),
    "PICK_PROPOSED",
    "USER_APPROVED",
    "ORDER_CREATED",
    "ORDER_CAPTURED",
  ]);
  const decisions = events.filter((e) => e.event_type === "POLICY_DECISION");
  expect(decisions.map((event) => event.payload.rank)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
});

test.each([
  ["a higher amount", { currency_code: "USD", value: "129.98" }],
  ["a lower amount", { currency_code: "USD", value: "29.97" }],
  ["another currency", { currency_code: "EUR", value: "29.98" }],
])(
  "IT-PAY-009 a PayPal order with %s returns 409 AMOUNT_MISMATCH and sends no capture",
  async (_name, amount) => {
    const paypal = fakePayPal({ [GET_ORDER]: () => approvedOrder({})(amount) });
    const cookie = await newCookie();
    const { mandateId, orderId } = await createdOrder(cookie);

    const { response, body } = await captureOrder(cookie, orderId);

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("AMOUNT_MISMATCH");
    expect(paypal.callsTo(CAPTURE)).toEqual([]);
    const state = await stored(orderId);
    expect(state.order.status).toBe("FAILED");
    expect(state.mandate.status).toBe("APPROVED");
    expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
      event_type: "ORDER_BLOCKED",
      actor: "POLICY",
      decision: "BLOCK",
      reason_codes: ["AMOUNT_MISMATCH"],
    });
  },
);

test.each(["CREATED", "PAYER_ACTION_REQUIRED", "COMPLETED"])(
  "IT-PAY-009 a PayPal order with status %s returns 409 PAYPAL_NOT_APPROVED and sends no capture",
  async (status) => {
    const paypal = fakePayPal({
      [GET_ORDER]: () =>
        approvedOrder({ status })({ currency_code: "USD", value: "29.98" }),
    });
    const cookie = await newCookie();
    const { mandateId, orderId } = await createdOrder(cookie);

    const { response, body } = await captureOrder(cookie, orderId);

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({
      code: "INVALID_STATE",
      details: { reason: "PAYPAL_NOT_APPROVED" },
    });
    expect(paypal.callsTo(CAPTURE)).toEqual([]);
    expect((await stored(orderId)).order.status).toBe("CREATED");
    expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
      event_type: "ORDER_BLOCKED",
      reason_codes: ["PAYPAL_NOT_APPROVED"],
    });
  },
);

test("IT-PAY-009 a failed lookup of the PayPal order returns 502 and sends no capture", async () => {
  const paypal = fakePayPal({
    [GET_ORDER]: () => ({ status: 500, body: {} }),
  });
  const cookie = await newCookie();
  const { orderId } = await createdOrder(cookie);

  const { response } = await captureOrder(cookie, orderId);

  expect(response.status).toBe(502);
  expect(paypal.callsTo(CAPTURE)).toEqual([]);
  expect((await stored(orderId)).order.status).toBe("CREATED");
});

test.each([
  ["missing", undefined],
  ["not a UUID", "capture-1"],
])(
  "IT-PAY-004 a capture Idempotency-Key that is %s returns 400 IDEMPOTENCY_KEY_REQUIRED",
  async (_name, key) => {
    const paypal = fakePayPal();
    const cookie = await newCookie();
    const { orderId } = await createdOrder(cookie);
    const callsBefore = paypal.calls.length;

    const response = await capture(
      post(
        `/api/orders/${orderId}/capture`,
        cookie,
        {},
        key === undefined ? {} : { "idempotency-key": key },
      ),
      { params: Promise.resolve({ id: orderId }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(paypal.calls).toHaveLength(callsBefore);
  },
);

test("IT-PAY-004 a capture replay returns the stored response and makes no new PayPal call or audit event", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId, orderId } = await createdOrder(cookie);
  const key = crypto.randomUUID();
  const first = await captureOrder(cookie, orderId, key);
  const callsAfterFirst = paypal.calls.length;
  const eventsAfterFirst = await auditEvents(cookie, mandateId);

  const replay = await captureOrder(cookie, orderId, key);

  expect(replay.response.status).toBe(200);
  expect(replay.response.headers.get("Idempotent-Replay")).toBe("true");
  expect(replay.body).toEqual(first.body);
  expect(paypal.calls).toHaveLength(callsAfterFirst);
  expect(await auditEvents(cookie, mandateId)).toEqual(eventsAfterFirst);
});

test("IT-PAY-004 a capture key is scoped to its order, so reuse on another order is a new request", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const first = await createdOrder(cookie);
  const second = await createdOrder(cookie);
  const key = crypto.randomUUID();

  const a = await captureOrder(cookie, first.orderId, key);
  const b = await captureOrder(cookie, second.orderId, key);

  expect(a.response.status).toBe(200);
  expect(b.response.status).toBe(200);
  expect(b.response.headers.get("Idempotent-Replay")).toBeNull();
  const records = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key));
  expect(records.map((record) => record.endpoint).sort()).toEqual(
    [
      `orders.capture:${first.orderId}`,
      `orders.capture:${second.orderId}`,
    ].sort(),
  );
});

test("IT-PAY-004 a capture arriving while the same key is in flight returns 409 IDEMPOTENCY_IN_PROGRESS", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const paypal = fakePayPal({
    [CAPTURE]: async () => {
      await gate;
      return {
        status: 201,
        body: {
          purchase_units: [
            { payments: { captures: [{ id: "CAP-1", status: "COMPLETED" }] } },
          ],
        },
      };
    },
  });
  const cookie = await newCookie();
  const { orderId } = await createdOrder(cookie);
  const key = crypto.randomUUID();

  const inFlight = captureOrder(cookie, orderId, key);
  await vi.waitFor(() => expect(paypal.callsTo(CAPTURE)).toHaveLength(1));
  const concurrent = await captureOrder(cookie, orderId, key);
  release();
  const finished = await inFlight;

  expect(concurrent.response.status).toBe(409);
  expect(concurrent.body.error.code).toBe("IDEMPOTENCY_IN_PROGRESS");
  expect(finished.response.status).toBe(200);
  expect(paypal.callsTo(CAPTURE)).toHaveLength(1);
});

test("IT-PAY-006 a second order after settlement returns 409 MANDATE_ALREADY_SETTLED", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId, orderId } = await createdOrder(cookie);
  await captureOrder(cookie, orderId);
  const callsBefore = paypal.calls.length;

  const response = await createOrder(
    post(
      "/api/orders",
      cookie,
      { mandate_id: mandateId },
      { "idempotency-key": crypto.randomUUID() },
    ),
  );

  expect(response.status).toBe(409);
  expect((await response.json()).error).toMatchObject({
    code: "INVALID_STATE",
    details: { reason: "MANDATE_ALREADY_SETTLED" },
  });
  expect(paypal.calls).toHaveLength(callsBefore);
});

test("IT-PAY-006 a second order while one is open returns 409 ORDER_ALREADY_OPEN with the open order's ID", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { mandateId, orderId } = await createdOrder(cookie);

  const response = await createOrder(
    post(
      "/api/orders",
      cookie,
      { mandate_id: mandateId },
      { "idempotency-key": crypto.randomUUID() },
    ),
  );

  expect(response.status).toBe(409);
  expect((await response.json()).error).toMatchObject({
    code: "INVALID_STATE",
    details: { reason: "ORDER_ALREADY_OPEN", order_id: orderId },
  });
  expect(
    await db.select().from(orders).where(eq(orders.mandate_id, mandateId)),
  ).toHaveLength(1);
});

test("IT-PAY-006 two concurrent captures with different keys yield exactly one CAPTURED order and one PayPal capture", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId, orderId } = await createdOrder(cookie);

  const results = await Promise.all([
    captureOrder(cookie, orderId, crypto.randomUUID()),
    captureOrder(cookie, orderId, crypto.randomUUID()),
  ]);

  expect(results.map(({ response }) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const loser = results.find(({ response }) => response.status === 409)!;
  expect(loser.body.error.details.reason).toBe("ORDER_NOT_CREATED");
  expect(paypal.callsTo(CAPTURE)).toHaveLength(1);
  const all = await db
    .select()
    .from(orders)
    .where(eq(orders.mandate_id, mandateId));
  expect(all.map((order) => order.status)).toEqual(["CAPTURED"]);
  expect(
    (await auditEvents(cookie, mandateId)).filter(
      (event) => event.event_type === "ORDER_CAPTURED",
    ),
  ).toHaveLength(1);
});

test("IT-PAY-006 the database refuses a second CAPTURED or CREATED order for one mandate", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { mandateId, order } = await createdOrder(cookie);
  const duplicate = (status: string) =>
    db.insert(orders).values({
      id: crypto.randomUUID(),
      mandate_id: mandateId,
      candidate_id: order.candidate_id,
      paypal_order_id: `PP-${crypto.randomUUID()}`,
      amount_cents: 2998,
      currency: "USD",
      status,
    });

  await expect(duplicate("CREATED")).rejects.toThrow();
  await duplicate("CAPTURED");
  await expect(duplicate("CAPTURED")).rejects.toThrow();
});

test("IT-PAY-006 capturing an order that is no longer CREATED returns 409 ORDER_NOT_CREATED", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { orderId } = await createdOrder(cookie);
  await captureOrder(cookie, orderId);

  const { response, body } = await captureOrder(cookie, orderId);

  expect(response.status).toBe(409);
  expect(body.error.details.reason).toBe("ORDER_NOT_CREATED");
});

test("IT-SEC-002 another session gets 404 when capturing this session's order", async () => {
  const paypal = fakePayPal();
  const { orderId } = await createdOrder(await newCookie());
  const callsBefore = paypal.calls.length;

  const { response, body } = await captureOrder(await newCookie(), orderId);

  expect(response.status).toBe(404);
  expect(body.error.code).toBe("NOT_FOUND");
  expect(paypal.calls).toHaveLength(callsBefore);
  expect((await stored(orderId)).order.status).toBe("CREATED");
});

test("IT-SEC-002 an unknown order ID returns 404", async () => {
  fakePayPal();

  const { response } = await captureOrder(
    await newCookie(),
    crypto.randomUUID(),
  );

  expect(response.status).toBe(404);
});

test.each([
  ["a field in the body", { amount: "0.01" }, undefined],
  ["a bad order UUID", {}, "not-a-uuid"],
])(
  "IT-SEC-004 the capture endpoint rejects %s with 400",
  async (_name, body, id) => {
    const paypal = fakePayPal();
    const cookie = await newCookie();
    const { orderId } = await createdOrder(cookie);
    const callsBefore = paypal.calls.length;

    const { response } = await captureOrder(
      cookie,
      id ?? orderId,
      crypto.randomUUID(),
      body,
    );

    expect(response.status).toBe(400);
    expect(paypal.calls).toHaveLength(callsBefore);
    expect((await stored(orderId)).order.status).toBe("CREATED");
  },
);

test("IT-SEC-006 a capture POST with a foreign Origin is rejected with 403", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { orderId } = await createdOrder(cookie);

  const { response } = await captureOrder(
    cookie,
    orderId,
    crypto.randomUUID(),
    {},
    { origin: "https://evil.example" },
  );

  expect(response.status).toBe(403);
});
