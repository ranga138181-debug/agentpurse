import { decide, type Decision } from "./decision";

interface StoredOrder {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
}

export interface PayPalOrderState {
  status: string;
  value: string;
  currency_code: string;
}

// PayPal amounts are decimal strings; they are converted without floating-point arithmetic.
function toCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function evaluateCapture(
  order: StoredOrder,
  paypalOrder: PayPalOrderState,
  orders: { id: string; status: string }[],
): Decision {
  if (order.status !== "CREATED") return decide(["ORDER_NOT_CREATED"]);
  if (
    orders.some((other) => other.id !== order.id && other.status === "CAPTURED")
  ) {
    return decide(["MANDATE_ALREADY_SETTLED"]);
  }
  if (
    toCents(paypalOrder.value) !== order.amount_cents ||
    paypalOrder.currency_code !== order.currency
  ) {
    return decide(["AMOUNT_MISMATCH"]);
  }
  if (paypalOrder.status !== "APPROVED") return decide(["PAYPAL_NOT_APPROVED"]);
  return decide([]);
}
