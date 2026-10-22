ALTER TABLE "incident_reports" ADD COLUMN IF NOT EXISTS "client_report_id" text;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD COLUMN IF NOT EXISTS "observed_at_s" integer;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD COLUMN IF NOT EXISTS "outcome" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "incident_reports_client_id_uq" ON "incident_reports" USING btree ("scenario_id","client_report_id");
