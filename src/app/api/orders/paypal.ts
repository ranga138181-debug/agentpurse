import { config } from "@/lib/config";
import { createPayPalClient } from "@/payment/paypal";

// One client per process, so the OAuth token is held in memory and reused.
export const paypal = createPayPalClient({
  ...config,
  fetch: (input, init) => fetch(input, init),
  now: Date.now,
});
