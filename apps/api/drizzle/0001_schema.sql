CREATE TABLE "incident_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"seq" integer NOT NULL,
	"incident_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"at_s" integer NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"incident_id" text,
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
	"received_at_s" integer NOT NULL,
	"snapped_edge_id" text NOT NULL,
	"distance_to_road_m" double precision NOT NULL,
	"geom" geometry(Point,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"depth" text,
	"congestion" text,
	"severity" text,
	"impassable" boolean DEFAULT false NOT NULL,
	"conflicting" boolean DEFAULT false NOT NULL,
	"edge_ids" text[] NOT NULL,
	"road_name" text,
	"report_count" integer DEFAULT 0 NOT NULL,
	"device_count" integer DEFAULT 0 NOT NULL,
	"created_at_s" integer NOT NULL,
	"last_report_at_s" integer NOT NULL,
	"updated_at_s" integer NOT NULL,
	"verified_at_s" integer,
	"verified_by" text,
	"closed_at_s" integer,
	"linked_incident_id" text,
	"note" text,
	"seq" integer NOT NULL,
	"geom" geometry(Point,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"node_id" text NOT NULL,
	"side" text,
	"address" text,
	"geom" geometry(Point,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_version" text NOT NULL,
	"from_node" text NOT NULL,
	"to_node" text NOT NULL,
	"reverse_id" text,
	"way_id" text NOT NULL,
	"name" text,
	"highway" text NOT NULL,
	"oneway" boolean NOT NULL,
	"bridge" boolean NOT NULL,
	"tunnel" boolean NOT NULL,
	"layer" integer NOT NULL,
	"length_m" double precision NOT NULL,
	"flood_prone" boolean NOT NULL,
	"geom" geometry(LineString,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"graph_version" text NOT NULL,
	"definition" jsonb NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"reset_seq" integer DEFAULT 0 NOT NULL,
	"reset_count" integer DEFAULT 0 NOT NULL,
	"run_id" text NOT NULL,
	"sim_state" text DEFAULT 'idle' NOT NULL,
	"sim_time_s" integer DEFAULT 0 NOT NULL,
	"next_event_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"status" text NOT NULL,
	"started_wall" timestamp with time zone,
	"ended_wall" timestamp with time zone,
	"events_applied" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "incident_events_scenario_seq_uq" ON "incident_events" USING btree ("scenario_id","seq");--> statement-breakpoint
CREATE INDEX "incident_reports_geom_gist" ON "incident_reports" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "incident_reports_scenario_device_idx" ON "incident_reports" USING btree ("scenario_id","device_hash");--> statement-breakpoint
CREATE INDEX "incident_reports_incident_idx" ON "incident_reports" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incidents_geom_gist" ON "incidents" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "incidents_scenario_seq_idx" ON "incidents" USING btree ("scenario_id","seq");--> statement-breakpoint
CREATE INDEX "incidents_scenario_type_status_idx" ON "incidents" USING btree ("scenario_id","type","status");--> statement-breakpoint
CREATE INDEX "places_geom_gist" ON "places" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "road_edges_geom_gist" ON "road_edges" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "road_edges_graph_version_name_idx" ON "road_edges" USING btree ("graph_version","name");