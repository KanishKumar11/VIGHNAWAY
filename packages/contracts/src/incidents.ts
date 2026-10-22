import { z } from 'zod';
import { IdSchema, LatLngSchema, SimSecondsSchema } from './primitives';

export const INCIDENT_TYPES = ['flood', 'closure', 'congestion', 'debris', 'accident', 'walking_concern'] as const;
export const IncidentTypeSchema = z.enum(INCIDENT_TYPES);
export type IncidentType = z.infer<typeof IncidentTypeSchema>;

/** Report types are the incident types plus Road clear, which never creates an incident. */
export const REPORT_TYPES = [...INCIDENT_TYPES, 'road_clear'] as const;
export const ReportTypeSchema = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const INCIDENT_STATUSES = [
  'unverified',
  'corroborated',
  'verified',
  'resolved',
  'dismissed',
] as const;
export const IncidentStatusSchema = z.enum(INCIDENT_STATUSES);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const OPEN_STATUSES: readonly IncidentStatus[] = ['unverified', 'corroborated', 'verified'];
export const isOpenStatus = (s: IncidentStatus): boolean => OPEN_STATUSES.includes(s);

/** Where the evidence came from. Shown on every incident. */
export const IncidentSourceSchema = z.enum(['simulated', 'user_report', 'operator', 'live_feed']);
export type IncidentSource = z.infer<typeof IncidentSourceSchema>;

/**
 * What a walking-concern report says about a road (P2-8): a condition of that road, never of a neighbourhood or of
 * people. Display only: no routing rule reads it unless the traveller turns on "Prefer well-lit roads" (P2-9).
 */
export const WALKING_CONCERNS = ['poorly_lit', 'isolated'] as const;
export const WalkingConcernSchema = z.enum(WALKING_CONCERNS);
export type WalkingConcern = z.infer<typeof WalkingConcernSchema>;

export const WALKING_CONCERN_LABEL: Record<WalkingConcern, string> = {
  poorly_lit: 'Poorly lit',
  isolated: 'Isolated stretch',
};

export const DepthSchema = z.enum(['ankle', 'knee', 'waist']);
export type Depth = z.infer<typeof DepthSchema>;

export const CongestionLevelSchema = z.enum(['moderate', 'heavy', 'standstill']);
export type CongestionLevel = z.infer<typeof CongestionLevelSchema>;

export const SeveritySchema = z.enum(['low', 'medium', 'high']);
export type Severity = z.infer<typeof SeveritySchema>;

/** Who set Verified. The scripted demo uses a simulated operator, labelled as such. */
export const VerifiedBySchema = z.enum(['operator', 'simulated_operator']);
export type VerifiedBy = z.infer<typeof VerifiedBySchema>;

export const FeedProviderSchema = z.enum(['tomtom']);
export type FeedProvider = z.infer<typeof FeedProviderSchema>;

/**
 * Provenance of an incident that came from a named external live feed (source 'live_feed').
 * Feed data is real-world data, never simulated, and is always labelled with its provider.
 */
export const FeedRefSchema = z.object({
  provider: FeedProviderSchema,
  externalId: z.string().max(200),
  /** Provider's delay estimate in seconds, if given. Display only; the engine uses its own rules. */
  delayS: z.number().int().min(0).nullable(),
  /** Provider magnitude: 0 unknown, 1 minor, 2 moderate, 3 major, 4 undefined (closures). */
  magnitude: z.number().int().min(0).max(4),
  probability: z.enum(['certain', 'probable', 'risk_of', 'improbable']).nullable(),
  description: z.string().max(300).nullable(),
  from: z.string().max(200).nullable(),
  to: z.string().max(200).nullable(),
  /** Server time (simulation/live clock seconds) of the poll that last saw this incident. */
  lastSeenAtS: SimSecondsSchema,
});
export type FeedRef = z.infer<typeof FeedRefSchema>;

export const IncidentSchema = z.object({
  id: IdSchema,
  scenarioId: IdSchema,
  type: IncidentTypeSchema,
  status: IncidentStatusSchema,
  source: IncidentSourceSchema,
  /** Flood only. null means depth not given, which the engine treats as knee depth. */
  depth: DepthSchema.nullable(),
  /** Congestion only. */
  congestion: CongestionLevelSchema.nullable(),
  /** Debris or accident only. */
  severity: SeveritySchema.nullable(),
  /** Walking concern only (P2-8). Absent for every other type. */
  concern: WalkingConcernSchema.nullable().optional(),
  /** Reported as impassable (debris, accident). Closures are always impassable. */
  impassable: z.boolean(),
  /**
   * A Road clear report contradicts this incident. Its routing effect stays in force (the
   * conservative choice) but route confidence drops to Low until an operator resolves it or
   * clear reports arrive from two different devices.
   */
  conflicting: z.boolean(),
  /** Affected directed edges, sorted. Includes both directions of two-way roads. */
  edgeIds: z.array(z.string()).min(1),
  point: LatLngSchema,
  roadName: z.string().nullable(),
  reportCount: z.number().int().min(0),
  /** Distinct device hashes among supporting reports (prototype heuristic, not proof). */
  deviceCount: z.number().int().min(0),
  createdAtS: SimSecondsSchema,
  /** Time of the latest supporting report; drives age and Stale. */
  lastReportAtS: SimSecondsSchema,
  updatedAtS: SimSecondsSchema,
  verifiedAtS: SimSecondsSchema.nullable(),
  verifiedBy: VerifiedBySchema.nullable(),
  closedAtS: SimSecondsSchema.nullable(),
  /** A late report about a resolved incident creates a new incident linked to the old one. */
  linkedIncidentId: IdSchema.nullable(),
  /** Latest plain-text note from a report (never rendered as HTML). */
  note: z.string().max(200).nullable(),
  /** Per-scenario sequence number of the change that produced this version. */
  seq: z.number().int().min(0),
  /** Set only for source 'live_feed'. */
  feed: FeedRefSchema.nullable().optional(),
  /**
   * True while every supporting report came from the demo audience (report origin 'audience'), so the
   * console can list them apart and clear them in one action. Absent otherwise.
   */
  audienceOnly: z.boolean().optional(),
});
export type Incident = z.infer<typeof IncidentSchema>;

export const INCIDENT_SOURCE_LABEL: Record<IncidentSource, string> = {
  simulated: 'Simulated',
  user_report: 'User report',
  operator: 'Operator',
  live_feed: 'Live traffic feed',
};

export const FEED_PROVIDER_LABEL: Record<FeedProvider, string> = { tomtom: 'TomTom' };

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  unverified: 'Unverified',
  corroborated: 'Corroborated',
  verified: 'Verified',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  flood: 'Flooding',
  closure: 'Road closed',
  congestion: 'Congestion',
  debris: 'Debris',
  accident: 'Accident',
  walking_concern: 'Walking concern',
};

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  ...INCIDENT_TYPE_LABEL,
  road_clear: 'Road clear',
};
