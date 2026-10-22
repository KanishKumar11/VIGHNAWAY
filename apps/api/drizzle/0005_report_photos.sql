CREATE TABLE "report_photos" (
	"report_id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"incident_id" text,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_photos_scenario_created_idx" ON "report_photos" USING btree ("scenario_id","created_at");