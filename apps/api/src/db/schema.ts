/**
 * Drizzle schema. Mirrors docs/DATA_MODEL.md. All geometries are SRID 4326 with a GiST index;
 * every `*_s` column is simulation seconds.
 */
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { lineStringGeom, pointGeom } from './geometry';

export const roadEdges = pgTable(
  'road_edges',
  {
    id: text('id').primaryKey(),
    graphVersion: text('graph_version').notNull(),
    fromNode: text('from_node').notNull(),
    toNode: text('to_node').notNull(),
    reverseId: text('reverse_id'),
    wayId: text('way_id').notNull(),
    name: text('name'),
    highway: text('highway').notNull(),
    oneway: boolean('oneway').notNull(),
    bridge: boolean('bridge').notNull(),
    tunnel: boolean('tunnel').notNull(),
    layer: integer('layer').notNull(),
    lengthM: doublePrecision('length_m').notNull(),
    floodProne: boolean('flood_prone').notNull(),
    geom: lineStringGeom('geom').notNull(),
  },
  (t) => [
    index('road_edges_geom_gist').using('gist', t.geom),
    index('road_edges_graph_version_name_idx').on(t.graphVersion, t.name),
  ],
);

export const places = pgTable(
  'places',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    nodeId: text('node_id').notNull(),
    side: text('side'),
    address: text('address'),
    geom: pointGeom('geom').notNull(),
  },
  (t) => [index('places_geom_gist').using('gist', t.geom)],
);

export const scenarios = pgTable('scenarios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  graphVersion: text('graph_version').notNull(),
  /** The full Scenario (contracts ScenarioSchema). */
  definition: jsonb('definition').notNull(),
  /** Per-scenario change counter; every incident change takes the next value. */
  seq: integer('seq').notNull().default(0),
  /** seq at the last reset: a client with sinceSeq < reset_seq gets a full snapshot. */
  resetSeq: integer('reset_seq').notNull().default(0),
  resetCount: integer('reset_count').notNull().default(0),
  runId: text('run_id').notNull(),
  simState: text('sim_state').notNull().default('idle'),
  simTimeS: integer('sim_time_s').notNull().default(0),
  nextEventIndex: integer('next_event_index').notNull().default(0),
});

export const incidents = pgTable(
  'incidents',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    source: text('source').notNull(),
    depth: text('depth'),
    congestion: text('congestion'),
    severity: text('severity'),
    impassable: boolean('impassable').notNull().default(false),
    conflicting: boolean('conflicting').notNull().default(false),
    edgeIds: text('edge_ids').array().notNull(),
    roadName: text('road_name'),
    reportCount: integer('report_count').notNull().default(0),
    deviceCount: integer('device_count').notNull().default(0),
    createdAtS: integer('created_at_s').notNull(),
    lastReportAtS: integer('last_report_at_s').notNull(),
    updatedAtS: integer('updated_at_s').notNull(),
    verifiedAtS: integer('verified_at_s'),
    verifiedBy: text('verified_by'),
    closedAtS: integer('closed_at_s'),
    linkedIncidentId: text('linked_incident_id'),
    note: text('note'),
    seq: integer('seq').notNull(),
    geom: pointGeom('geom').notNull(),
    /** Provenance for source 'live_feed' (contracts FeedRef); null otherwise. */
    feed: jsonb('feed'),
  },
  (t) => [
    index('incidents_geom_gist').using('gist', t.geom),
    index('incidents_scenario_seq_idx').on(t.scenarioId, t.seq),
    index('incidents_scenario_type_status_idx').on(t.scenarioId, t.type, t.status),
  ],
);

export const incidentReports = pgTable(
  'incident_reports',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id').notNull(),
    /** null for a Road clear report with nothing open nearby. */
    incidentId: text('incident_id'),
    type: text('type').notNull(),
    depth: text('depth'),
    congestion: text('congestion'),
    severity: text('severity'),
    impassable: boolean('impassable').notNull().default(false),
    observedPersonally: boolean('observed_personally').notNull(),
    description: text('description'),
    deviceHash: text('device_hash').notNull(),
    ipHash: text('ip_hash'),
    source: text('source').notNull(),
    receivedAtS: integer('received_at_s').notNull(),
    snappedEdgeId: text('snapped_edge_id').notNull(),
    distanceToRoadM: doublePrecision('distance_to_road_m').notNull(),
    geom: pointGeom('geom').notNull(),
  },
  (t) => [
    index('incident_reports_geom_gist').using('gist', t.geom),
    index('incident_reports_scenario_device_idx').on(t.scenarioId, t.deviceHash),
    index('incident_reports_incident_idx').on(t.incidentId),
  ],
);

export const incidentEvents = pgTable(
  'incident_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    scenarioId: text('scenario_id').notNull(),
    seq: integer('seq').notNull(),
    incidentId: text('incident_id').notNull(),
    kind: text('kind').notNull(),
    actor: text('actor').notNull(),
    atS: integer('at_s').notNull(),
    summary: text('summary').notNull(),
    payload: jsonb('payload').notNull(),
  },
  (t) => [uniqueIndex('incident_events_scenario_seq_uq').on(t.scenarioId, t.seq)],
);

export const simRuns = pgTable('sim_runs', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  status: text('status').notNull(),
  startedWall: timestamp('started_wall', { withTimezone: true }),
  endedWall: timestamp('ended_wall', { withTimezone: true }),
  eventsApplied: integer('events_applied').notNull().default(0),
});

export type IncidentRow = typeof incidents.$inferSelect;
export type IncidentReportRow = typeof incidentReports.$inferSelect;
export type ScenarioRow = typeof scenarios.$inferSelect;
