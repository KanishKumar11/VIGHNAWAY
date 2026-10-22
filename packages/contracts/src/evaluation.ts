import { z } from 'zod';
import {
  IncidentSourceSchema,
  IncidentStatusSchema,
  IncidentTypeSchema,
} from './incidents';
import { IdSchema, LatLngSchema, ProfileSchema, SimSecondsSchema } from './primitives';

/** These shapes are produced by packages/engine on the client. The server never sends them. */

/**
 * Structured text: a catalog key plus parameters. The engine builds every sentence as Text and
 * also renders it in English into the plain string field next to it. Clients render the Text in
 * the user's language with the engine's catalog (renderText), so both clients say the same thing.
 * String parameters are proper nouns (road and place names) and are never translated.
 */
export interface Text {
  key: string;
  params?: Record<string, TextParam>;
}
export type TextParam = string | number | Text;
export const TextSchema: z.ZodType<Text> = z.lazy(() =>
  z.object({
    key: z.string().min(1),
    params: z.record(z.string(), z.union([z.string(), z.number(), TextSchema])).optional(),
  }),
);

export const RouteRoleSchema = z.enum(['recommended', 'usual_fastest', 'alternative', 'blocked']);
export type RouteRole = z.infer<typeof RouteRoleSchema>;

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const HazardEffectSchema = z.enum(['block', 'warning', 'penalty', 'congestion', 'none']);
export type HazardEffect = z.infer<typeof HazardEffectSchema>;

export const RouteHazardSchema = z.object({
  incidentId: IdSchema,
  type: IncidentTypeSchema,
  status: IncidentStatusSchema,
  source: IncidentSourceSchema,
  effect: HazardEffectSchema,
  /** Ranking-only seconds; never shown as time. */
  penaltyS: z.number().int().min(0),
  /** Extra displayed seconds (verified or corroborated congestion only). */
  addedEtaS: z.number().int().min(0),
  firstEdgeId: z.string(),
  roadName: z.string().nullable(),
  /** Distance from the start of the route to the first affected edge. */
  positionM: z.number().int().min(0),
  ageS: z.number().int().min(0),
  stale: z.boolean(),
  conflicting: z.boolean(),
});
export type RouteHazard = z.infer<typeof RouteHazardSchema>;

export const DataGapSchema = z.object({
  edgeId: z.string(),
  roadName: z.string().nullable(),
  positionM: z.number().int().min(0),
  penaltyS: z.number().int().min(0),
});
export type DataGap = z.infer<typeof DataGapSchema>;

export const CrossingKindSchema = z.enum(['underpass', 'flyover', 'bridge', 'footbridge']);
export type CrossingKind = z.infer<typeof CrossingKindSchema>;

export const CrossingSchema = z.object({
  name: z.string(),
  kind: CrossingKindSchema,
  positionM: z.number().int().min(0),
  lengthM: z.number().int().min(0),
});
export type Crossing = z.infer<typeof CrossingSchema>;

export const ExplanationSchema = z.object({
  /** One sentence: why this route has its role. */
  reason: z.string(),
  /** e.g. "+6 min compared with the usual fastest route". Empty when there is no trade-off. */
  tradeOff: z.string(),
  /** What would make VIGHNAWAY reconsider. */
  recheckIf: z.string(),
  confidence: ConfidenceSchema,
  /** Short reasons behind the confidence label, in plain language. */
  confidenceReasons: z.array(z.string()),
  /** Structured forms of the four fields above, for localisation. Optional for older payloads. */
  reasonText: TextSchema.optional(),
  tradeOffText: TextSchema.optional(),
  recheckIfText: TextSchema.optional(),
  confidenceReasonTexts: z.array(TextSchema).optional(),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

/**
 * "Why not that route?": the smallest change that would make a route that is not recommended the
 * recommendation, found by re-ranking the routes shown (never guessed). Absent on the recommended route.
 * - blocked: the route is not viable while these incidents stand; `wouldBeRecommended` says whether
 *   clearing all of them would make it the recommendation.
 * - hazards: clearing these incidents would make it the recommendation. `smallest` is true only for a
 *   single incident; a set of several is "if these were cleared", not a claim of minimality.
 * - time: it would be recommended if its ranking cost were `cutS` seconds lower (the switching rule applied).
 * - none_sufficient: clearing its hazards (`hazards`) or saving any time (`time`) would not be enough.
 */
export const CounterfactualSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blocked'), blockerIds: z.array(IdSchema), wouldBeRecommended: z.boolean() }),
  z.object({ kind: z.literal('hazards'), incidentIds: z.array(IdSchema), smallest: z.boolean() }),
  z.object({ kind: z.literal('time'), cutS: z.number().int().min(1) }),
  z.object({ kind: z.literal('none_sufficient'), reason: z.enum(['hazards', 'time']) }),
]);
export type Counterfactual = z.infer<typeof CounterfactualSchema>;

export const RouteEvaluationSchema = z.object({
  /** Edge ids joined with "|". */
  routeId: z.string(),
  /** Short display name derived from the crossing ("Via Andheri Subway"). */
  name: z.string(),
  nameText: TextSchema.optional(),
  edgeIds: z.array(z.string()),
  nodeIds: z.array(z.string()),
  distanceM: z.number().int().min(0),
  /** Displayed ETA in whole seconds: edge times with verified or corroborated congestion only. */
  etaS: z.number().int().min(0),
  /** Ranking cost in whole seconds. Never displayed as time. */
  costS: z.number().int().min(0),
  viable: z.boolean(),
  blockedBy: z.array(z.object({ incidentId: IdSchema, edgeId: z.string(), reason: z.string() })),
  hazards: z.array(RouteHazardSchema),
  dataGaps: z.array(DataGapSchema),
  floodProneEdgeCount: z.number().int().min(0),
  crossings: z.array(CrossingSchema),
  roadNames: z.array(z.string()),
  usesStaleBlock: z.boolean(),
  /**
   * Step-free profile only (P2-3): segments of this route where step-free access is not recorded (footpaths, paths,
   * pedestrian streets, corridors). Mapped steps are never used. Absent for the other profiles.
   */
  stepFreeUnknownCount: z.number().int().min(0).optional(),
  /**
   * Set only when the traveller turned on "Prefer well-lit roads" (P2-9, foot profile): segments mapped lit=no,
   * segments where lighting is not mapped, and the walking-concern incidents on this route. Ranking only.
   */
  lighting: z
    .object({
      unlitCount: z.number().int().min(0),
      unknownCount: z.number().int().min(0),
      concernIds: z.array(IdSchema),
    })
    .optional(),
  role: RouteRoleSchema,
  explanation: ExplanationSchema,
  counterfactual: CounterfactualSchema.optional(),
  counterfactualText: TextSchema.optional(),
});
export type RouteEvaluation = z.infer<typeof RouteEvaluationSchema>;

export const RouteChangeSchema = z.object({
  fromRouteId: z.string().nullable(),
  toRouteId: z.string().nullable(),
  kind: z.enum(['invalid', 'outperformed', 'no_viable_route']),
  trigger: z
    .object({
      incidentId: IdSchema,
      type: IncidentTypeSchema,
      status: IncidentStatusSchema,
      source: IncidentSourceSchema,
    })
    .nullable(),
  /** Ranking gain in seconds when outperformed. */
  gainS: z.number().int().nullable(),
  /** Banner text built from the facts above. */
  message: z.string(),
  tradeOff: z.string(),
  messageText: TextSchema.optional(),
  tradeOffText: TextSchema.optional(),
});
export type RouteChange = z.infer<typeof RouteChangeSchema>;

export const ReachableSchema = z.object({
  placeId: IdSchema,
  placeName: z.string(),
  etaS: z.number().int().min(0),
  routeId: z.string(),
});
export type Reachable = z.infer<typeof ReachableSchema>;

export const PlanNoticeSchema = z.object({
  kind: z.enum(['unchanged_with_hazard', 'reversal', 'on_blocked_edge', 'no_viable_route']),
  message: z.string(),
  messageText: TextSchema.optional(),
});
export type PlanNotice = z.infer<typeof PlanNoticeSchema>;

export const PlanResultSchema = z.object({
  graphVersion: z.string(),
  profile: ProfileSchema,
  evaluatedAtS: SimSecondsSchema,
  originNodeId: z.string(),
  destinationNodeId: z.string(),
  incidentCount: z.number().int().min(0),
  /** Recommended first, then usual fastest, alternatives, blocked. */
  routes: z.array(RouteEvaluationSchema),
  recommendedRouteId: z.string().nullable(),
  usualFastestRouteId: z.string().nullable(),
  change: RouteChangeSchema.nullable(),
  notices: z.array(PlanNoticeSchema),
  noViableRoute: z.boolean(),
  reachable: ReachableSchema.nullable(),
  /** Set by replanFrom when the only option is turning back. */
  isReversal: z.boolean(),
  /** Remaining seconds on the vehicle's current edge before the plan starts (replanFrom). */
  leadInS: z.number().int().min(0),
  vehicle: z
    .object({ edgeId: z.string(), point: LatLngSchema, headingDeg: z.number() })
    .nullable(),
});
export type PlanResult = z.infer<typeof PlanResultSchema>;
