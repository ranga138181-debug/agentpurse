import type { Constraints } from "@/policy/evaluate-candidate";

export interface ParseInput {
  text: string;
  today: string;
  weekday: string;
  timezone: string;
  signal: AbortSignal;
}

export interface RankProduct {
  product_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  total_cents: number | null;
  estimated_delivery_date: string | null;
  in_stock: boolean | null;
}

export interface RankInput {
  constraints: Constraints & { query: string };
  products: RankProduct[];
  boundary: string;
  signal: AbortSignal;
}

// Both operations return unknown: the agent service validates every output.
export interface ModelAdapter {
  parseMandate(input: ParseInput): Promise<unknown>;
  rankProducts(input: RankInput): Promise<unknown>;
}
