export { SCORING_RULES, scoringRulesTable } from './rules';
export type { RuleEntry, ScoringRules } from './rules';
export { loadGraph, snapToNode, snapToEdge, isEdgeAllowed, speedKmh, nodePoint, edgeCumulative } from './graph';
export type { Graph, GEdge, EdgeSnap } from './graph';
export {
  dijkstra,
  dijkstraIdx,
  yenKShortest,
  yenKShortestIdx,
  penaltyAlternativesIdx,
  overlapFraction,
  pathKey,
  pathLength,
  baseTime,
} from './paths';
export type { Path, WeightFn, SearchOptions, YenOptions } from './paths';
export {
  alertContext,
  buildIncidentIndex,
  incidentEffect,
  ageFactor,
  isStale,
  isHard,
} from './incidents';
export type { EvalContext, IncidentIndex, IncidentEffect, EffectKind } from './incidents';
export { evaluate, crossingKind } from './evaluate';
export type { Evaluated } from './evaluate';
export { rank, compareEvaluations, exceedsSwitchThreshold, switchThresholdS } from './rank';
export type { RankResult, RankDecision } from './rank';
export { explain, confidenceFor, describeChange, hazardLabel, hazardPhrase, evidencePhrase } from './explain';
export type { ExplainContext } from './explain';
export { planTrip, replanFrom, findReachableDestination, planHash, edgeMultiplier, nodeLatLng } from './plan';
export type { PlanTripInput, ReplanInput, TripConditions } from './plan';
export {
  startVehicle,
  advanceVehicle,
  vehiclePosition,
  followPlan,
  travelledM,
  remainingEtaS,
} from './vehicle';
export type { VehicleState } from './vehicle';
export { canonicalJson, hashString, hashValue } from './hash';
export { haversineM, bearingDeg, pointAlong, cumulativeLengths } from './geo';

import type { GEdge, Graph } from './graph';
import type { LngLatTuple } from '@vighnaway/contracts';

/** Route polyline: edge geometries concatenated in order, duplicate joint points dropped. */
export function routeGeometry(graph: Graph, edgeIds: readonly string[]): LngLatTuple[] {
  const out: LngLatTuple[] = [];
  for (const id of edgeIds) {
    const ei = graph.edgeIndex.get(id);
    if (ei === undefined) continue;
    const e: GEdge = graph.edges[ei]!;
    for (const pt of e.geometry) {
      const last = out[out.length - 1];
      if (last && last[0] === pt[0] && last[1] === pt[1]) continue;
      out.push(pt);
    }
  }
  return out;
}
export { parityCases, parityHash } from './parity';
export { routeFlow, flowDurationMs, nextAction, spokenChange } from './present';
export type { RouteSegmentFlow } from './present';
