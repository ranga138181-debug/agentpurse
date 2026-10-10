import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { POST as createOrder } from "@/app/api/orders/route";
import { db } from "@/db/client";
import { mandates, orders } from "@/db/schema";
import {
  approvedMandate,
  auditEvents,
  fakePayPal,
  newCookie,
  post,
} from "./support";

afterEach(() => vi.restoreAllMocks());

async function orderAfter(minutes: number, extraMs = 0) {
  const paypal = fakePayPal();
  const cookie = await newCookie();
  const { mandateId } = await approvedMandate(cookie);
  await db
    .update(mandates)
    .set({ approved_at: new Date(Date.now() - minutes * 60_000 - extraMs) })
    .where(eq(mandates.id, mandateId));
  const response = await createOrder(
    post(
      "/api/orders",
      cookie,
      { mandate_id: mandateId },
      { "idempotency-key": crypto.randomUUID() },
    ),
  );
  const [mandate] = await db
    .select()
    .from(mandates)
    .where(eq(mandates.id, mandateId));
  return {
    paypal,
    cookie,
    mandateId,
    mandate,
    response,
    body: await response.json(),
  };
}

test("IT-PAY-011 an approval older than 15 minutes returns 409 APPROVAL_EXPIRED and the mandate returns to PROPOSED", async () => {
  const { paypal, cookie, mandateId, mandate, response, body } =
    await orderAfter(15, 5000);

  expect(response.status).toBe(409);
  expect(body.error.code).toBe("APPROVAL_EXPIRED");
  expect(mandate).toMatchObject({
    status: "PROPOSED",
    approved_candidate_id: null,
    approved_at: null,
  });
  expect(paypal.calls).toEqual([]);
  expect(
    await db.select().from(orders).where(eq(orders.mandate_id, mandateId)),
  ).toEqual([]);
  expect((await auditEvents(cookie, mandateId)).at(-1)).toMatchObject({
    event_type: "ORDER_BLOCKED",
    actor: "POLICY",
    decision: "BLOCK",
    reason_codes: ["APPROVAL_EXPIRED"],
  });
});

test("IT-PAY-011 an approval 14 minutes old still creates the order", async () => {
  const { mandate, response } = await orderAfter(14);

  expect(response.status).toBe(201);
  expect(mandate.status).toBe("APPROVED");
});
