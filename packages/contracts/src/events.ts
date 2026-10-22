import { z } from 'zod';
import { IncidentSchema } from './incidents';
import { IdSchema, LatLngSchema, ProfileSchema, SimSecondsSchema } from './primitives';

/** socket.io namespace for live events. */
export const LIVE_NAMESPACE = '/live';

export const SOCKET_EVENTS = {
  /** client → server: join a scenario room. */
  join: 'join',
  /** server → room: an incident was created or changed. */
  incidentUpserted: 'incident.upserted',
  /** server → room: simulation play state changed. */
  simState: 'sim.state',
  /** server → room: display-only clock, once per real second while playing. */
  simTick: 'sim.tick',
  /** server → room: scenario reset; clients must resync from seq. */
  simReset: 'sim.reset',
  /** phone → server → room: demo vehicle position, display only. Never affects routing. */
  tripPosition: 'trip.position',
} as const;

export const JoinPayloadSchema = z.object({ scenarioId: IdSchema });
export type JoinPayload = z.infer<typeof JoinPayloadSchema>;

export const IncidentUpsertedSchema = z.object({
  scenarioId: IdSchema,
  seq: z.number().int().min(0),
  incident: IncidentSchema,
  /** Plain-language ticker line, e.g. "Flooding at Andheri Subway marked Corroborated (2 devices)". */
  summary: z.string(),
});
export type IncidentUpserted = z.infer<typeof IncidentUpsertedSchema>;

export const SimPlayStateSchema = z.enum(['idle', 'playing', 'paused', 'finished']);
export type SimPlayState = z.infer<typeof SimPlayStateSchema>;

export const SimStateSchema = z.object({
  scenarioId: IdSchema,
  runId: z.string(),
  state: SimPlayStateSchema,
  simTimeS: SimSecondsSchema,
  nextEventIndex: z.number().int().min(0),
  eventCount: z.number().int().min(0),
  simSecondsPerRealSecond: z.number().positive(),
  seq: z.number().int().min(0),
});
export type SimState = z.infer<typeof SimStateSchema>;

export const SimTickSchema = z.object({
  scenarioId: IdSchema,
  runId: z.string(),
  simTimeS: SimSecondsSchema,
});
export type SimTick = z.infer<typeof SimTickSchema>;

export const SimResetSchema = z.object({
  scenarioId: IdSchema,
  runId: z.string(),
  seq: z.number().int().min(0),
});
export type SimReset = z.infer<typeof SimResetSchema>;

export const TripPositionSchema = z.object({
  scenarioId: IdSchema,
  routeId: z.string().max(20000),
  coordinate: LatLngSchema,
  headingDeg: z.number().min(0).max(360),
  simTimeS: SimSecondsSchema,
  /** Current edge and progress, so the console can draw the travelled part. */
  edgeId: z.string().nullable(),
  edgeFraction: z.number().min(0).max(1),
  profile: ProfileSchema,
  destinationId: IdSchema,
  /** Route the phone currently follows (edge ids), for display on the console. */
  edgeIds: z.array(z.string()).max(5000),
  travelledEdgeCount: z.number().int().min(0),
  status: z.enum(['en_route', 'arrived', 'stopped']),
});
export type TripPosition = z.infer<typeof TripPositionSchema>;
