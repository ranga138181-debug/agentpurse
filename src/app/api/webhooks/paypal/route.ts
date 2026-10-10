import { eq } from "drizzle-orm";
import { z } from "zod";
import { insertAuditEvent } from "@/audit/insert";
import { appendAuditEvent } from "@/audit/writer";
import { db } from "@/db/client";
import { mandates, orders, webhookEvents } from "@/db/schema";
import { config } from "@/lib/config";
import { errorResponse } from "@/lib/errors";
import { log } from "@/lib/logger";
import { route } from "@/lib/route";
import { PaymentProviderError } from "@/payment/paypal";
import { evaluateCapture } from "@/policy/evaluate-capture";
import { paypal } from "../../orders/paypal";

const TRANSMISSION_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

const eventSchema = z.object({
  id: z.string().min(1),
  event_type: z.string(),
  resource: z.unknown(),
});
const captureSchema = z.object({
  id: z.string().min(1),
  amount: z.object({ currency_code: z.string(), value: z.string() }),
  supplementary_data: z.object({
    related_ids: z.object({ order_id: z.string().min(1) }),
  }),
});

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export const POST = route(
  "/api/webhooks/paypal",
  async (request, requestId) => {
    const received = () => Response.json({ received: true });
    const invalid = () =>
      errorResponse(
        400,
        "WEBHOOK_SIGNATURE_INVALID",
        "The webhook could not be verified",
        requestId,
      );

    const rawBody = await request.text();
    const transmission = Object.fromEntries(
      Object.entries(TRANSMISSION_HEADERS).map(([field, header]) => [
        field,
        request.headers.get(header),
      ]),
    );
    const headers = z
      .object({
        auth_algo: z.string().min(1),
        cert_url: z.string().min(1),
        transmission_id: z.string().min(1),
        transmission_sig: z.string().min(1),
        transmission_time: z.string().min(1),
      })
      .safeParse(transmission);
    if (!headers.success || !isJson(rawBody)) return invalid();

    let verified: boolean;
    try {
      verified = await paypal.verifyWebhook(
        { ...headers.data, webhook_id: config.PAYPAL_WEBHOOK_ID },
        rawBody,
      );
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) throw error;
      // PayPal retries on 502; an unverifiable event is never treated as valid.
      return errorResponse(
        502,
        "PAYMENT_PROVIDER_ERROR",
        "The webhook could not be verified right now",
        requestId,
      );
    }
    if (!verified) {
      log("warn", "webhook signature invalid", { request_id: requestId });
      return invalid();
    }

    const event = eventSchema.safeParse(JSON.parse(rawBody));
    if (!event.success) return received();
    const { id, event_type, resource } = event.data;
    const inserted = await db
      .insert(webhookEvents)
      .values({ paypal_event_id: id, event_type })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) return received();
    const completed = event_type === "PAYMENT.CAPTURE.COMPLETED";
    const capture = captureSchema.safeParse(resource);
    if (!(completed || event_type === "PAYMENT.CAPTURE.DENIED")) {
      return received();
    }
    const ignore = (reason: string) => {
      log("info", "webhook ignored", {
        request_id: requestId,
        event_type,
        reason,
      });
      return received();
    };
    if (!capture.success) return ignore("unexpected resource shape");

    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ order: orders, session_id: mandates.session_id })
        .from(orders)
        .innerJoin(mandates, eq(orders.mandate_id, mandates.id))
        .where(
          eq(
            orders.paypal_order_id,
            capture.data.supplementary_data.related_ids.order_id,
          ),
        )
        .for("update", { of: orders });
      if (!row) return ignore("no matching order");
      const { order } = row;
      const siblings = await tx
        .select()
        .from(orders)
        .where(eq(orders.mandate_id, order.mandate_id));
      // A completed capture implies PayPal approval, so only C-01 to C-03 can block here.
      const { decision, primary_reason } = evaluateCapture(
        order,
        { status: "APPROVED", ...capture.data.amount },
        siblings,
      );
      if (decision === "BLOCK") return ignore(primary_reason as string);

      await tx
        .update(orders)
        .set(
          completed
            ? {
                status: "CAPTURED",
                paypal_capture_id: capture.data.id,
                updated_at: new Date(),
              }
            : { status: "FAILED", updated_at: new Date() },
        )
        .where(eq(orders.id, order.id));
      if (completed) {
        await tx
          .update(mandates)
          .set({ status: "SETTLED" })
          .where(eq(mandates.id, order.mandate_id));
      }
      await appendAuditEvent(insertAuditEvent, {
        session_id: row.session_id,
        mandate_id: order.mandate_id,
        actor: "PAYMENT",
        event_type: "WEBHOOK_RECEIVED",
        decision: null,
        reason_codes: [],
        payload: {
          order_id: order.id,
          paypal_order_id: order.paypal_order_id,
          total_cents: order.amount_cents,
          webhook_event: event_type,
        },
      });
      return received();
    });
  },
);
