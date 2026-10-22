import { z } from 'zod';
import { type Incident, IncidentSchema } from './incidents';
import { IdSchema, LatLngSchema, SimSecondsSchema } from './primitives';
import { ScenarioSchema } from './scenario';
import { SimStateSchema } from './events';

/** REST paths, relative to API_BASE_URL. */
export const API_PATHS = {
  health: '/health',
  scenarios: '/scenarios',
  scenario: (id: string) => `/scenarios/${encodeURIComponent(id)}`,
  incidents: (id: string) => `/scenarios/${encodeURIComponent(id)}/incidents`,
  reports: (id: string) => `/scenarios/${encodeURIComponent(id)}/reports`,
  reportPhoto: (id: string, reportId: string) =>
    `/scenarios/${encodeURIComponent(id)}/reports/${encodeURIComponent(reportId)}/photo`,
  photos: (id: string) => `/scenarios/${encodeURIComponent(id)}/photos`,
  incidentAction: (id: string, incidentId: string, action: OperatorAction) =>
    `/scenarios/${encodeURIComponent(id)}/incidents/${encodeURIComponent(incidentId)}/${action}`,
  sim: (id: string) => `/scenarios/${encodeURIComponent(id)}/sim`,
  simAction: (id: string, action: SimAction) =>
    `/scenarios/${encodeURIComponent(id)}/sim/${action}`,
  operatorCheck: '/operator/check',
  feed: (id: string) => `/scenarios/${encodeURIComponent(id)}/feed`,
  history: (id: string) => `/scenarios/${encodeURIComponent(id)}/history`,
  clearAudience: (id: string) => `/scenarios/${encodeURIComponent(id)}/audience/clear`,
  closures: (id: string) => `/scenarios/${encodeURIComponent(id)}/closures`,
  hospitals: (id: string) => `/scenarios/${encodeURIComponent(id)}/hospitals`,
  hospital: (id: string, placeId: string) => `/scenarios/${encodeURIComponent(id)}/hospitals/${encodeURIComponent(placeId)}`,
  authOtpRequest: '/auth/otp/request',
  authOtpVerify: '/auth/otp/verify',
  authLogout: '/auth/logout',
  authMe: '/auth/me',
  myStats: '/me/stats',
  adminUsers: '/admin/users',
  adminUser: (id: string) => `/admin/users/${encodeURIComponent(id)}`,
} as const;

export const OperatorActionSchema = z.enum(['verify', 'resolve', 'dismiss']);
export type OperatorAction = z.infer<typeof OperatorActionSchema>;

export const SimActionSchema = z.enum(['play', 'pause', 'step', 'reset']);
export type SimAction = z.infer<typeof SimActionSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  postgis: z.string().nullable(),
  graphVersion: z.string().nullable(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ScenarioSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  area: z.string(),
  mode: z.enum(['simulated', 'live']).default('simulated'),
  simulated: z.boolean(),
  graphVersion: z.string(),
});
export type ScenarioSummary = z.infer<typeof ScenarioSummarySchema>;

export const ScenarioListResponseSchema = z.object({ scenarios: z.array(ScenarioSummarySchema) });
export type ScenarioListResponse = z.infer<typeof ScenarioListResponseSchema>;

export const ScenarioResponseSchema = z.object({
  scenario: ScenarioSchema,
  sim: SimStateSchema,
});
export type ScenarioResponse = z.infer<typeof ScenarioResponseSchema>;

export const IncidentsQuerySchema = z.object({
  sinceSeq: z.coerce.number().int().min(0).optional(),
});
export type IncidentsQuery = z.infer<typeof IncidentsQuerySchema>;

/**
 * GET /scenarios/:id/incidents?sinceSeq=n
 * When `full` is true (no sinceSeq, or sinceSeq predates the last reset) the client must replace
 * its incident set; otherwise it merges `incidents` by id.
 */
/**
 * Latest observation on a flood-prone edge, from any report including Road clear (which creates no
 * incident). It lets clients tell "no reports" from "reports say clear" when showing coverage. An
 * observation never removes a hazard penalty or a block.
 */
export const ObservationSchema = z.object({
  edgeId: z.string(),
  lastObservedAtS: SimSecondsSchema,
  kind: z.enum(['hazard', 'clear']),
});
export type ObservationPayload = z.infer<typeof ObservationSchema>;

export const IncidentsResponseSchema = z.object({
  scenarioId: IdSchema,
  seq: z.number().int().min(0),
  full: z.boolean(),
  runId: z.string(),
  simTimeS: SimSecondsSchema,
  incidents: z.array(IncidentSchema),
  /** Latest observation per flood-prone edge (current state, not versioned by seq). Absent from older servers. */
  observations: z.array(ObservationSchema).optional(),
});
export type IncidentsResponse = z.infer<typeof IncidentsResponseSchema>;

export const OperatorActionBodySchema = z
  .object({ note: z.string().trim().max(200).optional() })
  .strict();
export type OperatorActionBody = z.infer<typeof OperatorActionBodySchema>;

/**
 * POST /scenarios/:id/closures (operator): a closure the control room draws as a line along a road
 * (P2-6). Without `confirm` it is a preview: the roads the line matches, nothing created. With
 * `confirm: true` it creates one Verified closure, source "operator", through the incident path.
 */
export const CLOSURE_MAX_POINTS = 20;
export const ClosureRequestSchema = z
  .object({
    polyline: z.array(LatLngSchema).min(2).max(CLOSURE_MAX_POINTS),
    confirm: z.boolean().default(false),
    note: z.string().trim().max(200).optional(),
  })
  .strict();
export type ClosureRequest = z.infer<typeof ClosureRequestSchema>;

export const ClosureResponseSchema = z.object({
  preview: z.object({
    /** Matched road edges, both directions, sorted. */
    edgeIds: z.array(z.string()),
    roadNames: z.array(z.string()),
    lengthM: z.number().min(0),
  }),
  /** Set only when the request confirmed it. */
  incident: IncidentSchema.nullable(),
});
export type ClosureResponse = z.infer<typeof ClosureResponseSchema>;

/**
 * Hospital state (P2-4): set by an operator, one value per hospital, "accepting" when never set.
 * GET /scenarios/:id/hospitals lists every hospital of the scenario; PUT /scenarios/:id/hospitals/:placeId
 * (operator) sets one. The state only ranks which hospital a "nearest hospital" trip is assigned to;
 * it never closes a road and is labelled "Set by control room" (and "Simulated" in the demo).
 */
export const HOSPITAL_STATES = ['accepting', 'busy', 'diverting'] as const;
export const HospitalStateSchema = z.enum(HOSPITAL_STATES);
export type HospitalStateValue = z.infer<typeof HospitalStateSchema>;

export const HospitalStatusSchema = z.object({
  placeId: IdSchema,
  name: z.string(),
  state: HospitalStateSchema,
  /** Simulation seconds when the operator last set it; null when it was never set. */
  setAtS: SimSecondsSchema.nullable(),
  setBy: z.literal('operator').nullable(),
});
export type HospitalStatus = z.infer<typeof HospitalStatusSchema>;

export const HospitalStatesResponseSchema = z.object({
  scenarioId: IdSchema,
  simulated: z.boolean(),
  hospitals: z.array(HospitalStatusSchema),
});
export type HospitalStatesResponse = z.infer<typeof HospitalStatesResponseSchema>;

export const SetHospitalStateRequestSchema = z.object({ state: HospitalStateSchema }).strict();
export type SetHospitalStateRequest = z.infer<typeof SetHospitalStateRequestSchema>;

/** POST /scenarios/:id/audience/clear: dismisses every open incident that only audience reports support. */
export const ClearAudienceResponseSchema = z.object({ cleared: z.number().int().min(0), incidentIds: z.array(IdSchema) });
export type ClearAudienceResponse = z.infer<typeof ClearAudienceResponseSchema>;

export const OperatorActionResponseSchema = z.object({ incident: IncidentSchema });
export type OperatorActionResponse = z.infer<typeof OperatorActionResponseSchema>;

export const SimResponseSchema = z.object({ sim: SimStateSchema });
export type SimResponse = z.infer<typeof SimResponseSchema>;

/**
 * GET /scenarios/:id/history: every incident change of the current run, oldest first, with the
 * incident as it was after that change. Lets a client rebuild the incident set at any seq and
 * replay the engine's decision for that moment (the engine is deterministic).
 */
export const HistoryEntrySchema = z.object({
  seq: z.number().int().min(0),
  atS: SimSecondsSchema,
  kind: z.string(),
  summary: z.string(),
  incident: IncidentSchema,
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const HistoryResponseSchema = z.object({
  scenarioId: IdSchema,
  runId: z.string(),
  resetSeq: z.number().int().min(0),
  entries: z.array(HistoryEntrySchema),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

/** Rebuilds the incident set as it was right after `seq` from history entries. */
export function incidentsAtSeq(entries: readonly HistoryEntry[], seq: number): Incident[] {
  const byId = new Map<string, Incident>();
  for (const e of entries) {
    if (e.seq > seq) break;
    byId.set(e.incident.id, e.incident);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** GET /scenarios/:id/feed: live traffic feed status (live scenarios only). */
export const FeedStatusSchema = z.object({
  scenarioId: IdSchema,
  provider: z.enum(['tomtom']),
  enabled: z.boolean(),
  /** Why it is disabled, e.g. "TOMTOM_API_KEY not set". */
  reason: z.string().nullable(),
  pollIntervalS: z.number().int().positive(),
  lastPollAtS: z.number().int().nullable(),
  lastSuccessAtS: z.number().int().nullable(),
  lastError: z.string().nullable(),
  activeIncidents: z.number().int().min(0),
  attribution: z.string(),
});
export type FeedStatus = z.infer<typeof FeedStatusSchema>;

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_ON_ROAD',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  NOT_ON_ROAD: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
