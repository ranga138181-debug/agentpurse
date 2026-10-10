export interface Candidate {
  id: string;
  product_id: string;
  title: string | null;
  merchant: string | null;
  price_cents: number | null;
  shipping_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  estimated_delivery_date: string | null;
  rank: number;
  rationale: string | null;
  decision: "ALLOW" | "BLOCK";
  reason_codes: string[];
}

export interface Order {
  id: string;
  paypal_order_id: string;
  status: "CREATED" | "CAPTURED" | "FAILED";
}

export interface Mandate {
  id: string;
  status: string;
  constraints: {
    max_total_cents: number;
    deliver_by: string | null;
    exclude_terms: string[];
  } | null;
  pick_candidate_id: string | null;
  approved_candidate_id: string | null;
  candidates: Candidate[];
  order: Order | null;
}

export interface ApiError {
  code: string;
  details?: { reason_codes?: string[]; reason?: string };
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

export async function api<T>(
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return response.ok ? { ok: true, data } : { ok: false, error: data.error };
  } catch {
    return { ok: false, error: { code: "NETWORK" } };
  }
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "unknown";
  return `$${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
