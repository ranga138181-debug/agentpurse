// PayPal is sandbox only: there is no configuration that points this client at the live host.
export const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";

export function createPayPalClient(settings: { PAYPAL_ENV: string }) {
  if (settings.PAYPAL_ENV !== "sandbox") {
    throw new Error("PAYPAL_ENV must be sandbox");
  }
  return { baseUrl: PAYPAL_BASE_URL };
}
