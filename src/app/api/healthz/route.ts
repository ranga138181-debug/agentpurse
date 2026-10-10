import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthResponse } from "@/lib/health";
import { route } from "@/lib/route";

export const GET = route("/api/healthz", () =>
  healthResponse(() => db.execute(sql`select 1`)),
);
