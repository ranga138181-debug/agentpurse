import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export default async function migrateDatabase() {
  const db = drizzle(process.env.DATABASE_URL);
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.$client.end();
}

if (import.meta.main) await migrateDatabase();
