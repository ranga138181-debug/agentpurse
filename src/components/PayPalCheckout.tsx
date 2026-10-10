"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRef } from "react";
import { api, type ApiError, type Order } from "./api";

interface PayPalCheckoutProps {
  mandateId: string;
  onSettled: () => void;
  onError: (error: ApiError) => void;
}

export function PayPalCheckout({
  mandateId,
  onSettled,
  onError,
}: PayPalCheckoutProps) {
  // One creation key per approval and one capture key per order, reused on retry (02-ARCHITECTURE section 6).
  const createKey = useRef(crypto.randomUUID());
  const order = useRef<Order | null>(null);
  const captureKeys = useRef(new Map<string, string>());

  return (
    <PayPalScriptProvider
      options={{
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID as string,
        currency: "USD",
        intent: "capture",
      }}
    >
      <PayPalButtons
        fundingSource="paypal"
        createOrder={async () => {
          const result = await api<Order>(
            "/api/orders",
            { mandate_id: mandateId },
            createKey.current,
          );
          if (!result.ok) {
            onError(result.error);
            throw new Error(result.error.code);
          }
          order.current = result.data;
          return result.data.paypal_order_id;
        }}
        onApprove={async () => {
          const { id } = order.current as Order;
          const key = captureKeys.current.get(id) ?? crypto.randomUUID();
          captureKeys.current.set(id, key);
          const result = await api<Order>(`/api/orders/${id}/capture`, {}, key);
          if (result.ok) return onSettled();
          // A failed order is final, so the next attempt needs a new order and a new key.
          createKey.current = crypto.randomUUID();
          onError(result.error);
        }}
      />
    </PayPalScriptProvider>
  );
}
