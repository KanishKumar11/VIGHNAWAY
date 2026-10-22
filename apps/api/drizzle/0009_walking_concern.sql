ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "concern" text;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD COLUMN IF NOT EXISTS "concern" text;
