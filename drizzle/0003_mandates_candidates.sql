CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mandate_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"title" text,
	"merchant" text,
	"category" text,
	"image_url" text,
	"product_url" text,
	"price_cents" integer,
	"shipping_cents" integer,
	"tax_cents" integer,
	"total_cents" integer,
	"currency" text,
	"estimated_delivery_date" date,
	"in_stock" boolean,
	"rank" integer NOT NULL,
	"rationale" text,
	"decision" text NOT NULL,
	"reason_codes" text[] NOT NULL,
	"policy_version" text NOT NULL,
	CONSTRAINT "candidates_mandate_id_product_id_unique" UNIQUE("mandate_id","product_id"),
	CONSTRAINT "candidates_mandate_id_rank_unique" UNIQUE("mandate_id","rank")
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"timezone" text NOT NULL,
	"status" text NOT NULL,
	"max_total_cents" integer,
	"currency" text,
	"query" text,
	"deliver_by" date,
	"exclude_terms" text[] DEFAULT '{}' NOT NULL,
	"reject_reasons" text[] DEFAULT '{}' NOT NULL,
	"pick_candidate_id" uuid,
	"approved_candidate_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;