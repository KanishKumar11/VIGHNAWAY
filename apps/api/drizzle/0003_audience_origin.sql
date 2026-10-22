ALTER TABLE "incident_reports" ADD COLUMN "origin" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "audience_only" boolean DEFAULT false NOT NULL;
