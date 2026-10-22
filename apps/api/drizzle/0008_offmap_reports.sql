CREATE TABLE IF NOT EXISTS "offmap_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"type" text NOT NULL,
	"depth" text,
	"congestion" text,
	"severity" text,
	"impassable" boolean DEFAULT false NOT NULL,
	"observed_personally" boolean NOT NULL,
	"description" text,
	"device_hash" text NOT NULL,
	"ip_hash" text,
	"source" text NOT NULL,
	"origin" text DEFAULT 'app' NOT NULL,
	"user_id" text,
	"client_report_id" text,
	"observed_at_s" integer,
	"received_at_s" integer NOT NULL,
	"geom" geometry(Point,4326) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offmap_reports_geom_gist" ON "offmap_reports" USING gist ("geom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offmap_reports_scenario_time_idx" ON "offmap_reports" USING btree ("scenario_id","received_at_s");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "offmap_reports_client_id_uq" ON "offmap_reports" USING btree ("scenario_id","client_report_id");
