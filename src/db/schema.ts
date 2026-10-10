import {
  bigserial,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const auditEvents = pgTable("audit_events", {
  seq: bigserial("seq", { mode: "number" }).primaryKey(),
  id: uuid("id").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  session_id: uuid("session_id"),
  mandate_id: uuid("mandate_id"),
  actor: text("actor").notNull(),
  event_type: text("event_type").notNull(),
  decision: text("decision"),
  reason_codes: text("reason_codes").array().notNull(),
  payload: jsonb("payload").notNull(),
});
