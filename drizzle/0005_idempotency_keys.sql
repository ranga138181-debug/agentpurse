CREATE TABLE "idempotency_keys" (
	"session_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"state" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_session_id_endpoint_key_pk" PRIMARY KEY("session_id","endpoint","key")
);
