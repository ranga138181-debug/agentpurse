import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  // Null only for events written before the hash chain existed.
  prev_hash: text("prev_hash"),
  hash: text("hash"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mandates = pgTable("mandates", {
  id: uuid("id").primaryKey(),
  session_id: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  raw_text: text("raw_text").notNull(),
  timezone: text("timezone").notNull(),
  status: text("status").notNull(),
  max_total_cents: integer("max_total_cents"),
  currency: text("currency"),
  query: text("query"),
  deliver_by: date("deliver_by"),
  exclude_terms: text("exclude_terms").array().notNull().default([]),
  reject_reasons: text("reject_reasons").array().notNull().default([]),
  pick_candidate_id: uuid("pick_candidate_id"),
  approved_candidate_id: uuid("approved_candidate_id"),
  approved_at: timestamp("approved_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey(),
    mandate_id: uuid("mandate_id")
      .notNull()
      .references(() => mandates.id),
    product_id: text("product_id").notNull(),
    title: text("title"),
    merchant: text("merchant"),
    category: text("category"),
    image_url: text("image_url"),
    product_url: text("product_url"),
    price_cents: integer("price_cents"),
    shipping_cents: integer("shipping_cents"),
    tax_cents: integer("tax_cents"),
    total_cents: integer("total_cents"),
    currency: text("currency"),
    estimated_delivery_date: date("estimated_delivery_date"),
    in_stock: boolean("in_stock"),
    rank: integer("rank").notNull(),
    rationale: text("rationale"),
    decision: text("decision").notNull(),
    reason_codes: text("reason_codes").array().notNull(),
    policy_version: text("policy_version").notNull(),
  },
  (table) => [
    unique().on(table.mandate_id, table.product_id),
    unique().on(table.mandate_id, table.rank),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    mandate_id: uuid("mandate_id")
      .notNull()
      .references(() => mandates.id),
    candidate_id: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id),
    paypal_order_id: text("paypal_order_id").notNull().unique(),
    paypal_capture_id: text("paypal_capture_id"),
    amount_cents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_one_captured_per_mandate")
      .on(table.mandate_id)
      .where(sql`${table.status} = 'CAPTURED'`),
    uniqueIndex("orders_one_created_per_mandate")
      .on(table.mandate_id)
      .where(sql`${table.status} = 'CREATED'`),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    session_id: uuid("session_id").notNull(),
    endpoint: text("endpoint").notNull(),
    key: uuid("key").notNull(),
    request_hash: text("request_hash").notNull(),
    state: text("state").notNull(),
    response_status: integer("response_status"),
    response_body: jsonb("response_body"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.endpoint, table.key] }),
  ],
);

export const webhookEvents = pgTable("webhook_events", {
  paypal_event_id: text("paypal_event_id").primaryKey(),
  event_type: text("event_type").notNull(),
  received_at: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
