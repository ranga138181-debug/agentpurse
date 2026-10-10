import { z } from "zod";

// PayPal is sandbox only: there is no configuration that points this client at the live host.
export const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";

const REQUEST_TIMEOUT_MS = 10000;
const TOKEN_EXPIRY_MARGIN_MS = 60000;

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number(),
});
const createdOrderSchema = z.object({ id: z.string().min(1) });
const amountSchema = z.object({ currency_code: z.string(), value: z.string() });
const orderStateSchema = z.object({
  status: z.string(),
  purchase_units: z.array(z.object({ amount: amountSchema })).min(1),
});
const captureSchema = z.object({
  purchase_units: z
    .array(
      z.object({
        payments: z.object({
          captures: z
            .array(z.object({ id: z.string().min(1), status: z.string() }))
            .min(1),
        }),
      }),
    )
    .min(1),
});

export type CaptureResult =
  { outcome: "COMPLETED"; captureId: string } | { outcome: "DECLINED" };

export class PaymentProviderError extends Error {
  name = "PaymentProviderError";

  constructor(
    message: string,
    readonly debugId?: string,
  ) {
    super(message);
  }
}

interface PayPalSettings {
  PAYPAL_ENV: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  fetch: typeof fetch;
  now: () => number;
}

export interface CreateOrderInput {
  requestId: string;
  mandateId: string;
  orderId: string;
  currency: string;
  priceCents: number;
  shippingCents: number;
  taxCents: number;
}

export function formatAmount(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function createPayPalClient(settings: PayPalSettings) {
  if (settings.PAYPAL_ENV !== "sandbox") {
    throw new Error("PAYPAL_ENV must be sandbox");
  }
  let token: { value: string; expiresAt: number } | null = null;

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await settings.fetch(`${PAYPAL_BASE_URL}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new PaymentProviderError("PayPal request failed");
    }
  }

  async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    const body: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (response.ok && parsed.success) return parsed.data;
    const debugId = z.object({ debug_id: z.string() }).safeParse(body);
    throw new PaymentProviderError(
      `PayPal responded with ${response.status}`,
      debugId.success ? debugId.data.debug_id : undefined,
    );
  }

  async function accessToken(): Promise<string> {
    if (token && settings.now() < token.expiresAt) return token.value;
    const credentials = btoa(
      `${settings.PAYPAL_CLIENT_ID}:${settings.PAYPAL_CLIENT_SECRET}`,
    );
    const response = await send("/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const { access_token, expires_in } = await read(response, tokenSchema);
    token = {
      value: access_token,
      expiresAt: settings.now() + expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    };
    return access_token;
  }

  return {
    baseUrl: PAYPAL_BASE_URL,

    async createOrder(input: CreateOrderInput): Promise<{ id: string }> {
      const money = (cents: number) => ({
        currency_code: input.currency,
        value: formatAmount(cents),
      });
      const response = await send("/v2/checkout/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": input.requestId,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: input.mandateId,
              custom_id: input.orderId,
              amount: {
                ...money(
                  input.priceCents + input.shippingCents + input.taxCents,
                ),
                breakdown: {
                  item_total: money(input.priceCents),
                  shipping: money(input.shippingCents),
                  tax_total: money(input.taxCents),
                },
              },
            },
          ],
        }),
      });
      return read(response, createdOrderSchema);
    },

    async getOrder(paypalOrderId: string) {
      const response = await send(`/v2/checkout/orders/${paypalOrderId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${await accessToken()}` },
      });
      const { status, purchase_units } = await read(response, orderStateSchema);
      return { status, ...purchase_units[0].amount };
    },

    async captureOrder(
      paypalOrderId: string,
      requestId: string,
    ): Promise<CaptureResult> {
      const response = await send(
        `/v2/checkout/orders/${paypalOrderId}/capture`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": requestId,
          },
        },
      );
      // PayPal reports a refused capture as 422, or as a capture whose status is not COMPLETED or PENDING.
      if (response.status === 422) return { outcome: "DECLINED" };
      const [capture] = (await read(response, captureSchema)).purchase_units[0]
        .payments.captures;
      if (capture.status === "COMPLETED") {
        return { outcome: "COMPLETED", captureId: capture.id };
      }
      if (capture.status === "DECLINED" || capture.status === "FAILED") {
        return { outcome: "DECLINED" };
      }
      throw new PaymentProviderError(`PayPal capture is ${capture.status}`);
    },
  };
}
