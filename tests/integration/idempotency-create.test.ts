import { and, eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { POST as createOrder } from "@/app/api/orders/route";
import { db } from "@/db/client";
import { idempotencyKeys, orders } from "@/db/schema";
import {
  approvedMandate,
  auditEvents,
  fakePayPal,
  newCookie,
  post,
} from "./support";

afterEach(() => vi.restoreAllMocks());

async function order(cookie: string, mandateId: string, key?: string) {
  const response = await createOrder(
    post(
      "/api/orders",
      cookie,
      { mandate_id: mandateId },
      key === undefined ? {} : { "idempotency-key": key },
    ),
  );
  return { response, body: await response.json() };
}

const records = (key: string) =>
  db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
const storedOrders = (mandateId: string) =>
  db.select().from(orders).where(eq(orders.mandate_id, mandateId));

test.each([
  ["missing", undefined],
  ["not a UUID", "order-123"],
  ["empty", ""],
])(
  "IT-PAY-003 an Idempotency-Key that is %s returns 400 IDEMPOTENCY_KEY_REQUIRED",
  async (_name, key) => {
    const paypal = fakePayPal();
    const cookie = await newCookie();
    const { mandateId } = await approvedMandate(cookie);

    const { response, body } = await order(cookie, mandateId, key);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(paypal.calls).toEqual([]);
    expect(await storedOrders(mandateId)).toEqual([]);
  },
);

test("IT-PAY-003 a replay returns the stored response with Idempotent-Replay and no new PayPal call or audit event", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  const key = crypto.randomUUID();
  const first = await order(cookie, mandateId, key);
  const callsAfterFirst = paypal.calls.length;
  const eventsAfterFirst = await auditEvents(cookie, mandateId);

  const replay = await order(cookie, mandateId, key);

  expect(first.response.status).toBe(201);
  expect(first.response.headers.get("Idempotent-Replay")).toBeNull();
  expect(replay.response.status).toBe(201);
  expect(replay.response.headers.get("Idempotent-Replay")).toBe("true");
  expect(replay.body).toEqual(first.body);
  expect(paypal.calls).toHaveLength(callsAfterFirst);
  expect(await auditEvents(cookie, mandateId)).toEqual(eventsAfterFirst);
  expect(await storedOrders(mandateId)).toHaveLength(1);
});

test("IT-PAY-003 a stored 4xx response is replayed too", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  await order(cookie, mandateId, crypto.randomUUID());
  const key = crypto.randomUUID();
  const first = await order(cookie, mandateId, key);
  const eventsAfterFirst = await auditEvents(cookie, mandateId);

  const replay = await order(cookie, mandateId, key);

  expect(first.response.status).toBe(409);
  expect(first.body.error.details.reason).toBe("ORDER_ALREADY_OPEN");
  expect(replay.response.status).toBe(409);
  expect(replay.response.headers.get("Idempotent-Replay")).toBe("true");
  expect(replay.body).toEqual(first.body);
  expect(await auditEvents(cookie, mandateId)).toEqual(eventsAfterFirst);
});

test("IT-PAY-003 a key reused with a different body returns 422 IDEMPOTENCY_KEY_REUSED", async () => {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const first = await approvedMandate(cookie);
  const second = await approvedMandate(cookie);
  const key = crypto.randomUUID();
  await order(cookie, first.mandateId, key);
  const callsAfterFirst = paypal.calls.length;

  const { response, body } = await order(cookie, second.mandateId, key);

  expect(response.status).toBe(422);
  expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  expect(paypal.calls).toHaveLength(callsAfterFirst);
  expect(await storedOrders(second.mandateId)).toEqual([]);
});

test("IT-PAY-003 the same key from another session is independent", async () => {
  fakePayPal();
  const cookieA = await newCookie();
  const cookieB = await newCookie();
  const a = await approvedMandate(cookieA);
  const b = await approvedMandate(cookieB);
  const key = crypto.randomUUID();

  const first = await order(cookieA, a.mandateId, key);
  const second = await order(cookieB, b.mandateId, key);

  expect(first.response.status).toBe(201);
  expect(second.response.status).toBe(201);
  expect(second.response.headers.get("Idempotent-Replay")).toBeNull();
});

test("IT-PAY-003 a request arriving while the same key is in flight returns 409 IDEMPOTENCY_IN_PROGRESS", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const paypal = fakePayPal({
    "POST /v2/checkout/orders": async () => {
      await gate;
      return { status: 201, body: { id: `PP-${crypto.randomUUID()}` } };
    },
  });
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  const key = crypto.randomUUID();

  const inFlight = order(cookie, mandateId, key);
  await vi.waitFor(() => expect(paypal.orderCalls()).toHaveLength(1));
  const concurrent = await order(cookie, mandateId, key);
  release();
  const finished = await inFlight;

  expect(concurrent.response.status).toBe(409);
  expect(concurrent.body.error.code).toBe("IDEMPOTENCY_IN_PROGRESS");
  expect(finished.response.status).toBe(201);
  expect(paypal.orderCalls()).toHaveLength(1);
  expect(await storedOrders(mandateId)).toHaveLength(1);
});

test("IT-PAY-003 after a 5xx the record is removed and a retry with the same key succeeds", async () => {
  let attempts = 0;
  const paypal = fakePayPal({
    "POST /v2/checkout/orders": () =>
      ++attempts === 1
        ? { status: 503, body: { debug_id: "dbg" } }
        : { status: 201, body: { id: `PP-${crypto.randomUUID()}` } },
  });
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  const key = crypto.randomUUID();

  const failed = await order(cookie, mandateId, key);
  const recordsAfterFailure = await records(key);
  const retry = await order(cookie, mandateId, key);

  expect(failed.response.status).toBe(502);
  expect(recordsAfterFailure).toEqual([]);
  expect(retry.response.status).toBe(201);
  expect(retry.response.headers.get("Idempotent-Replay")).toBeNull();
  expect(
    paypal.orderCalls().map((call) => call.headers["PayPal-Request-Id"]),
  ).toEqual([key, key]);
  expect((await records(key))[0]).toMatchObject({
    state: "COMPLETED",
    response_status: 201,
    endpoint: "orders.create",
  });
});

test("IT-PAY-003 a record older than 24 hours is treated as a new key", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  const key = crypto.randomUUID();
  await order(cookie, mandateId, key);
  await db
    .update(idempotencyKeys)
    .set({ created_at: new Date(Date.now() - 24 * 60 * 60 * 1000 - 5000) })
    .where(and(eq(idempotencyKeys.key, key)));

  const again = await order(cookie, mandateId, key);

  expect(again.response.headers.get("Idempotent-Replay")).toBeNull();
  expect(again.response.status).toBe(409);
  expect(again.body.error.details.reason).toBe("ORDER_ALREADY_OPEN");
});

test("IT-PAY-003 a validation error is not stored against the key", async () => {
  fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  const key = crypto.randomUUID();

  const invalid = await createOrder(
    post(
      "/api/orders",
      cookie,
      { mandate_id: mandateId, amount: 1 },
      { "idempotency-key": key },
    ),
  );
  const valid = await order(cookie, mandateId, key);

  expect(invalid.status).toBe(400);
  expect(valid.response.status).toBe(201);
});
