import { z } from "zod";

export const config = z
  .object({
    DATABASE_URL: z.url(),
    SESSION_SECRET: z.string().min(32),
    APP_URL: z.url(),
    RENDER_GIT_COMMIT: z.string().min(1),
  })
  .parse(process.env);
