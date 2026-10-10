import { z } from "zod";

export const config = z
  .object({
    DATABASE_URL: z.url(),
    SESSION_SECRET: z.string().min(32),
    APP_URL: z.url(),
  })
  .parse(process.env);
