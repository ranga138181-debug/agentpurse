import type { orders } from "@/db/schema";

export function toOrder(order: typeof orders.$inferSelect) {
  return {
    id: order.id,
    mandate_id: order.mandate_id,
    candidate_id: order.candidate_id,
    paypal_order_id: order.paypal_order_id,
    paypal_capture_id: order.paypal_capture_id,
    amount_cents: order.amount_cents,
    currency: order.currency,
    status: order.status,
    created_at: order.created_at,
  };
}
