import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { mandates, orders } from "@/db/schema";
import { errorResponse } from "@/lib/errors";
import { idempotent } from "@/lib/idempotency";
import { log } from "@/lib/logger";
import { sessionRoute } from "@/lib/session-route";
import { validate } from "@/lib/validate";
import { PaymentProviderError, type CaptureResult } from "@/payment/paypal";
import { evaluateCapture } from "@/policy/evaluate-capture";
import { paypal } from "../../paypal";
import { toOrder } from "../../serialise";

const paramsSchema = z.strictObject({ id: z.uuid() });
const bodySchema = z.strictObject({});

export const POST = sessionRoute<{ params: Promise<{ id: string }> }>(
  "/api/orders/{id}/capture",
  async (request, { requestId, sessionId }, { params }) => {
    const input = validate(paramsSchema, await params, requestId);
    if (input instanceof Response) return input;
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

    const providerError = (mandateId: string, error: PaymentProviderError) => {
      log("error", "paypal", {
        request_id: requestId,
        mandate_id: mandateId,
        order_id: input.id,
        error_code: "PAYMENT_PROVIDER_ERROR",
        paypal_debug_id: error.debugId,
      });
      return errorResponse(
        502,
        "PAYMENT_PROVIDER_ERROR",
        "The payment provider could not capture the order",
        requestId,
      );
    };

    return idempotent(
      {
        sessionId,
        endpoint: `orders.capture:${input.id}`,
        key: key.data,
        body,
        requestId,
        now: new Date(),
      },
      // The order row is locked for the whole capture, so concurrent captures run one after another.
      () =>
        db.transaction(async (tx) => {
          const [row] = await tx
            .select({ order: orders })
            .from(orders)
            .innerJoin(mandates, eq(orders.mandate_id, mandates.id))
            .where(
              and(eq(orders.id, input.id), eq(mandates.session_id, sessionId)),
            )
            .for("update", { of: orders });
          if (!row) {
            return errorResponse(
              404,
              "NOT_FOUND",
              "Order not found",
              requestId,
            );
          }
          const { order } = row;
          const setStatus = (values: Partial<typeof orders.$inferInsert>) =>
            tx
              .update(orders)
              .set({ ...values, updated_at: new Date() })
              .where(eq(orders.id, order.id))
              .returning();
          const audit = (actor: string, event_type: string, extra: object) =>
            appendAuditEvent(insertAuditEvent, {
              session_id: sessionId,
              mandate_id: order.mandate_id,
              actor,
              event_type,
              decision: null,
              reason_codes: [],
              ...extra,
              payload: {
                order_id: order.id,
                paypal_order_id: order.paypal_order_id,
                total_cents: order.amount_cents,
              },
            });

          let result: CaptureResult;
          try {
            const paypalOrder = await paypal.getOrder(order.paypal_order_id);
            const siblings = await tx
              .select()
              .from(orders)
              .where(eq(orders.mandate_id, order.mandate_id));
            const { decision, reason_codes, primary_reason } = evaluateCapture(
              order,
              paypalOrder,
              siblings,
            );
            if (decision === "BLOCK") {
              if (primary_reason === "AMOUNT_MISMATCH") {
                await setStatus({ status: "FAILED" });
              }
              if (
                primary_reason === "AMOUNT_MISMATCH" ||
                primary_reason === "PAYPAL_NOT_APPROVED"
              ) {
                await audit("POLICY", "ORDER_BLOCKED", {
                  decision: "BLOCK",
                  reason_codes,
                });
              }
              return primary_reason === "AMOUNT_MISMATCH"
                ? errorResponse(
                    409,
                    "AMOUNT_MISMATCH",
                    "The PayPal order does not match the stored order",
                    requestId,
                  )
                : errorResponse(
                    409,
                    "INVALID_STATE",
                    "The order cannot be captured now",
                    requestId,
                    { reason: primary_reason },
                  );
            }
            result = await paypal.captureOrder(order.paypal_order_id, key.data);
          } catch (error) {
            if (!(error instanceof PaymentProviderError)) throw error;
            return providerError(order.mandate_id, error);
          }

          if (result.outcome === "DECLINED") {
            await setStatus({ status: "FAILED" });
            await audit("PAYMENT", "ORDER_FAILED", {});
            return errorResponse(
              502,
              "PAYMENT_PROVIDER_ERROR",
              "The payment provider declined the capture",
              requestId,
            );
          }
          const [captured] = await setStatus({
            status: "CAPTURED",
            paypal_capture_id: result.captureId,
          });
          await tx
            .update(mandates)
            .set({ status: "SETTLED" })
            .where(eq(mandates.id, order.mandate_id));
          await audit("PAYMENT", "ORDER_CAPTURED", { decision: "ALLOW" });
          return Response.json(toOrder(captured));
        }),
    );
  },
);
