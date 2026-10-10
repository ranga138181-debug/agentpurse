import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { candidates, mandates, orders } from "@/db/schema";
import { errorResponse } from "@/lib/errors";
import { idempotent } from "@/lib/idempotency";
import { log } from "@/lib/logger";
import { sessionRoute } from "@/lib/session-route";
import { validate } from "@/lib/validate";
import { PaymentProviderError } from "@/payment/paypal";
import { evaluateOrder } from "@/policy/evaluate-order";
import { paypal } from "./paypal";
import { toOrder } from "./serialise";

const bodySchema = z.strictObject({ mandate_id: z.uuid() });
const INVALID_STATES = [
  "MANDATE_ALREADY_SETTLED",
  "MANDATE_NOT_APPROVED",
  "ORDER_ALREADY_OPEN",
];

export const POST = sessionRoute(
  "/api/orders",
  async (request, { requestId, sessionId }) => {
    const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
    if (!key.success) {
      return errorResponse(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "An Idempotency-Key header containing a UUID is required",
        requestId,
      );
    }
    const body = validate(
      bodySchema,
      await request.json().catch(() => undefined),
      requestId,
    );
    if (body instanceof Response) return body;
    const now = new Date();

    return idempotent(
      {
        sessionId,
        endpoint: "orders.create",
        key: key.data,
        body,
        requestId,
        now,
      },
      async () => {
        const [mandate] = await db
          .select()
          .from(mandates)
          .where(
            and(
              eq(mandates.id, body.mandate_id),
              eq(mandates.session_id, sessionId),
            ),
          );
        if (!mandate) {
          return errorResponse(
            404,
            "NOT_FOUND",
            "Mandate not found",
            requestId,
          );
        }
        const [candidate = null] = mandate.approved_candidate_id
          ? await db
              .select()
              .from(candidates)
              .where(eq(candidates.id, mandate.approved_candidate_id))
          : [];
        const existing = await db
          .select()
          .from(orders)
          .where(eq(orders.mandate_id, mandate.id));
        const audit = (actor: string, event_type: string, extra: object) =>
          appendAuditEvent(insertAuditEvent, {
            session_id: sessionId,
            mandate_id: mandate.id,
            actor,
            event_type,
            decision: null,
            reason_codes: [],
            payload: {},
            ...extra,
          });

        const { decision, reason_codes, primary_reason } = evaluateOrder(
          mandate,
          candidate,
          existing,
          now,
        );
        if (decision === "BLOCK" || candidate === null) {
          await audit("POLICY", "ORDER_BLOCKED", {
            decision: "BLOCK",
            reason_codes,
          });
          if (INVALID_STATES.includes(primary_reason as string)) {
            const open = existing.find((order) => order.status === "CREATED");
            return errorResponse(
              409,
              "INVALID_STATE",
              "An order cannot be created for this mandate now",
              requestId,
              {
                reason: primary_reason,
                ...(primary_reason === "ORDER_ALREADY_OPEN" && {
                  order_id: open?.id,
                }),
              },
            );
          }
          if (primary_reason === "APPROVAL_EXPIRED") {
            await db
              .update(mandates)
              .set({
                status: "PROPOSED",
                approved_candidate_id: null,
                approved_at: null,
              })
              .where(eq(mandates.id, mandate.id));
            return errorResponse(
              409,
              "APPROVAL_EXPIRED",
              "The approval has expired; approve again",
              requestId,
            );
          }
          return errorResponse(
            409,
            "POLICY_BLOCKED",
            "The policy engine blocked this order",
            requestId,
            { reason_codes },
          );
        }

        const orderId = crypto.randomUUID();
        let paypalOrder: { id: string };
        try {
          // Rule R-01 passed in evaluateOrder, so the three amounts are integers.
          paypalOrder = await paypal.createOrder({
            requestId: key.data,
            mandateId: mandate.id,
            orderId,
            currency: candidate.currency as string,
            priceCents: candidate.price_cents as number,
            shippingCents: candidate.shipping_cents as number,
            taxCents: candidate.tax_cents as number,
          });
        } catch (error) {
          if (!(error instanceof PaymentProviderError)) throw error;
          log("error", "paypal", {
            request_id: requestId,
            mandate_id: mandate.id,
            error_code: "PAYMENT_PROVIDER_ERROR",
            paypal_debug_id: error.debugId,
          });
          return errorResponse(
            502,
            "PAYMENT_PROVIDER_ERROR",
            "The payment provider could not create the order",
            requestId,
          );
        }

        const [order] = await db
          .insert(orders)
          .values({
            id: orderId,
            mandate_id: mandate.id,
            candidate_id: candidate.id,
            paypal_order_id: paypalOrder.id,
            amount_cents: candidate.total_cents as number,
            currency: candidate.currency as string,
            status: "CREATED",
          })
          .returning();
        await audit("PAYMENT", "ORDER_CREATED", {
          decision: "ALLOW",
          payload: {
            order_id: order.id,
            paypal_order_id: order.paypal_order_id,
            product_id: candidate.product_id,
            total_cents: order.amount_cents,
          },
        });
        return Response.json(toOrder(order), { status: 201 });
      },
    );
  },
);
