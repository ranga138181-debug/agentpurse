import { z } from "zod";
import { AI_PROVIDERS } from "@/agent/model";

const optional = z.string().optional();

export const config = z
  .object({
    DATABASE_URL: z.url(),
    SESSION_SECRET: z.string().min(32),
    APP_URL: z.url(),
    RENDER_GIT_COMMIT: z.string().min(1),
    AI_PROVIDER: z.enum(AI_PROVIDERS),
    AI_MODEL: optional,
    AI_API_KEY: optional,
    CHANNEL3_API_KEY: z.string().min(1).optional(),
    PAYPAL_ENV: z.literal("sandbox"),
    PAYPAL_CLIENT_ID: z.string().min(1),
    PAYPAL_CLIENT_SECRET: z.string().min(1),
    PAYPAL_WEBHOOK_ID: z.string().min(1),
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: z.string().min(1),
    DAILY_MANDATE_CAP: z.coerce.number().int().min(1),
  })
  .refine(
    (env) => env.AI_PROVIDER === "fake" || (env.AI_MODEL && env.AI_API_KEY),
    { error: "AI_MODEL and AI_API_KEY are required for a real AI_PROVIDER" },
  )
  .parse(process.env);
