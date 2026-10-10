import { z } from "zod";

export const config = z.object({ DATABASE_URL: z.url() }).parse(process.env);
