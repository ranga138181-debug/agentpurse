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

function isIanaZone(zone: string): boolean {
  if (zone !== "UTC" && !zone.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const mandateRequestSchema = z.strictObject({
  text: z.string().refine((text) => {
    const { length } = text.trim();
    return length >= 1 && length <= 500;
  }),
  timezone: z.string().refine(isIanaZone),
});
