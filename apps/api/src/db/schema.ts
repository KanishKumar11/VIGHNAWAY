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
import { bytea, lineStringGeom, pointGeom } from './geometry';

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
  /** Operator-set hospital states (P2-4): { [placeId]: { state, setAtS } }. Cleared on reset. */
  hospitalStates: jsonb('hospital_states').notNull().default({}),
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
    /** Walking concern incidents only (P2-8): poorly_lit or isolated. */
    concern: text('concern'),
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
    /** True while every supporting report came from the demo audience (report origin 'audience'). */
    audienceOnly: boolean('audience_only').notNull().default(false),
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
    /** Walking concern reports only (P2-8): poorly_lit or isolated. */
    concern: text('concern'),
    impassable: boolean('impassable').notNull().default(false),
    observedPersonally: boolean('observed_personally').notNull(),
    description: text('description'),
    deviceHash: text('device_hash').notNull(),
    ipHash: text('ip_hash'),
    source: text('source').notNull(),
    /** Report origin: app, web, audience or prompt (contracts ReportOrigin). Labels and limits only. */
    origin: text('origin').notNull().default('app'),
    /** Signed-in reporter (users.id), or null for an anonymous report. Thanks and history only; never evidence. */
    userId: text('user_id'),
    /** Device-made UUID (P2-2): a repeat gets the original receipt. */
    clientReportId: text('client_report_id'),
    /** The device's claim of when it observed this (display only; receivedAtS is authoritative). */
    observedAtS: integer('observed_at_s'),
    /** The outcome returned in the receipt, kept so a repeat can return it again. */
    outcome: text('outcome'),
    receivedAtS: integer('received_at_s').notNull(),
    snappedEdgeId: text('snapped_edge_id').notNull(),
    distanceToRoadM: doublePrecision('distance_to_road_m').notNull(),
    geom: pointGeom('geom').notNull(),
  },
  (t) => [
    index('incident_reports_geom_gist').using('gist', t.geom),
    index('incident_reports_scenario_device_idx').on(t.scenarioId, t.deviceHash),
    index('incident_reports_incident_idx').on(t.incidentId),
    index('incident_reports_user_idx').on(t.userId),
    uniqueIndex('incident_reports_client_id_uq').on(t.scenarioId, t.clientReportId),
  ],
);

/**
 * Live-mode reports that landed outside every mapped road (P2: report from anywhere). Kept apart from
 * incident_reports on purpose: that table's rows all have a snapped edge and feed incidents and routing;
 * these never do. They keep the point and time so they can be triaged, or re-snapped if a graph is added.
 */
export const offmapReports = pgTable(
  'offmap_reports',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id').notNull(),
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
    origin: text('origin').notNull().default('app'),
    userId: text('user_id'),
    clientReportId: text('client_report_id'),
    observedAtS: integer('observed_at_s'),
    receivedAtS: integer('received_at_s').notNull(),
    geom: pointGeom('geom').notNull(),
  },
  (t) => [
    index('offmap_reports_geom_gist').using('gist', t.geom),
    index('offmap_reports_scenario_time_idx').on(t.scenarioId, t.receivedAtS),
    uniqueIndex('offmap_reports_client_id_uq').on(t.scenarioId, t.clientReportId),
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

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  /** Lower-cased. */
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('citizen'),
  displayName: text('display_name'),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

/** One row per code sent. The code itself is never stored, only an HMAC of email + code. */
export const authOtps = pgTable(
  'auth_otps',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    client: text('client').notNull(),
    ipHash: text('ip_hash'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('auth_otps_email_created_idx').on(t.email, t.createdAt), index('auth_otps_ip_created_idx').on(t.ipHash, t.createdAt)],
);

/** Opaque bearer sessions. Only the sha256 of the token is stored. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    client: text('client').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

/**
 * A photo of the place, attached to one report by the device that sent it. Operators only: no public
 * endpoint returns it. The phone re-encodes it as a small JPEG (no EXIF); nothing reads it for routing.
 */
export const reportPhotos = pgTable(
  'report_photos',
  {
    /** incident_reports.id: one photo per report. */
    reportId: text('report_id').primaryKey(),
    scenarioId: text('scenario_id').notNull(),
    /** The incident the report belongs to, copied at upload so the console can list by incident. */
    incidentId: text('incident_id'),
    contentType: text('content_type').notNull(),
    bytes: bytea('bytes').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('report_photos_scenario_created_idx').on(t.scenarioId, t.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type ReportPhotoRow = typeof reportPhotos.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type IncidentReportRow = typeof incidentReports.$inferSelect;
export type ScenarioRow = typeof scenarios.$inferSelect;
