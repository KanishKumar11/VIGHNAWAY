import { z } from 'zod';
import { ReportInputSchema } from './reports';
import { IdSchema, LatLngSchema, ProfileSchema, SimSecondsSchema } from './primitives';

export const PlaceKindSchema = z.enum(['hospital', 'shelter', 'origin', 'landmark']);
export type PlaceKind = z.infer<typeof PlaceKindSchema>;

export const PlaceSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: PlaceKindSchema,
  point: LatLngSchema,
  /** Graph node the place is reached through. */
  nodeId: z.string(),
  side: z.enum(['east', 'west']).nullable(),
  address: z.string().nullable(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const AlertSchema = z.object({
  id: IdSchema,
  kind: z.literal('rain'),
  label: z.string(),
  /** Simulated alerts say so; a real feed would name its source. */
  source: z.string(),
  simulated: z.boolean(),
  activeFromS: SimSecondsSchema,
  activeUntilS: SimSecondsSchema.nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

const EventBase = z.object({
  id: IdSchema,
  atS: SimSecondsSchema,
  /** Plain-language line for the console ticker and the demo script. */
  label: z.string(),
});

/** A scripted report, applied through the same service method as a real report. */
export const ScenarioReportEventSchema = EventBase.extend({
  kind: z.literal('report'),
  report: ReportInputSchema,
});

/** A scripted operator action against the incident created or touched by `targetEventId`. */
export const ScenarioOperatorEventSchema = EventBase.extend({
  kind: z.enum(['verify', 'resolve', 'dismiss']),
  targetEventId: IdSchema,
});

export const ScenarioEventSchema = z.discriminatedUnion('kind', [
  ScenarioReportEventSchema,
  ScenarioOperatorEventSchema,
]);
export type ScenarioEvent = z.infer<typeof ScenarioEventSchema>;

export const DemoTripSchema = z.object({
  profile: ProfileSchema,
  originId: IdSchema,
  destinationId: IdSchema,
  /** Places offered when the destination is unreachable. */
  alternativeDestinationIds: z.array(IdSchema),
  /** Multiplier on modelled speeds for the simulated demo vehicle (1 = modelled speed). */
  vehicleSpeedFactor: z.number().positive(),
  /** Simulation time at which the scripted demo starts the trip. */
  startTripAtS: SimSecondsSchema,
});
export type DemoTrip = z.infer<typeof DemoTripSchema>;

export const ScenarioSchema = z.object({
  id: IdSchema,
  name: z.string(),
  area: z.string(),
  /**
   * 'simulated': scripted demo; the UI labels everything from it as Simulated.
   * 'live': real-world mode; incidents come from user reports, operators and live feeds, the clock
   * is the wall clock, and nothing is labelled Simulated (live feed incidents name their provider).
   */
  mode: z.enum(['simulated', 'live']).default('simulated'),
  /** True for mode 'simulated'. Kept for clients that only check this flag. */
  simulated: z.boolean(),
  timezone: z.string(),
  /** Wall-clock instant that simulation second 0 represents (ISO 8601 with offset). */
  clockStartsAt: z.string(),
  /** Simulated seconds that pass per real second while playing. */
  simSecondsPerRealSecond: z.number().positive(),
  graphVersion: z.string(),
  alerts: z.array(AlertSchema),
  /** False when the scenario has no alert information at all ("No rain alert information"). */
  hasAlertInformation: z.boolean(),
  places: z.array(PlaceSchema),
  demoTrip: DemoTripSchema,
  events: z.array(ScenarioEventSchema),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
