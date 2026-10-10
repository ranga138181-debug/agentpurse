import { z } from "zod";

export const parseOutputSchema = z.strictObject({
  query: z.string().min(1).max(80),
  deliver_by: z.iso.date().nullable(),
  exclude_terms: z.array(z.string().min(1).max(30)).max(5),
});

export const rankOutputSchema = z.strictObject({
  ranking: z
    .array(
      z.strictObject({
        product_id: z.string(),
        rationale: z.string().min(1).max(280),
      }),
    )
    .min(1),
});
