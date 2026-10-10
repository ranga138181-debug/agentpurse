import { z } from "zod";
import { AI_PROVIDERS } from "@/agent/model";

export const config = z
  .object({
    DATABASE_URL: z.url(),
    SESSION_SECRET: z.string().min(32),
    APP_URL: z.url(),
    RENDER_GIT_COMMIT: z.string().min(1),
    AI_PROVIDER: z.enum(AI_PROVIDERS),
    SEARCH_PROVIDER: z.enum(["fixture"]).default("fixture"),
  })
  .parse(process.env);
