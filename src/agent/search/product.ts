import { z } from "zod";

const httpsUrl = z.url({ protocol: /^https$/ }).nullable();
const cents = z.int().nullable();

export const productSchema = z.object({
  product_id: z.string().min(1).max(64),
  title: z.string().max(120).nullable(),
  description: z.string().max(500).nullable(),
  merchant: z.string().nullable(),
  category: z.string().nullable(),
  image_url: httpsUrl,
  product_url: httpsUrl,
  price_cents: cents,
  shipping_cents: cents,
  tax_cents: cents,
  currency: z.string().length(3).nullable(),
  in_stock: z.boolean().nullable(),
  estimated_delivery_date: z.iso.date().nullable(),
});

export type Product = z.infer<typeof productSchema>;

export interface ProductSearch {
  search(query: string, limit: number): Promise<unknown[]>;
}
