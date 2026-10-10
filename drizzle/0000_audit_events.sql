CREATE TABLE "audit_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid,
	"mandate_id" uuid,
	"actor" text NOT NULL,
	"event_type" text NOT NULL,
	"decision" text,
	"reason_codes" text[] NOT NULL,
	"payload" jsonb NOT NULL
);
