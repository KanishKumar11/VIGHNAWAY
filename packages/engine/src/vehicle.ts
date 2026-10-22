import type { Incident, LatLng, PlanResult } from '@vighnaway/contracts';
import { pointAlong } from './geo';
import type { Graph } from './graph';
import { edgeCumulative } from './graph';
import type { EvalContext, IncidentIndex } from './incidents';
import { buildIncidentIndex } from './incidents';
import { edgeMultiplier } from './plan';

/**
 * Simulated demo vehicle. It advances along the followed route using the simulation clock and
 * each edge's modelled travel time, including verified or corroborated congestion. Display and
 * demo only: a real trip takes positions from the device instead.
 */
export interface VehicleState {
  /** Edge ids being followed, starting with the edge the vehicle was on when the plan was made. */
  edgeIds: string[];
  index: number;
  /** Progress along edgeIds[index], 0..1. */
  fraction: number;
  arrived: boolean;
}

export function startVehicle(edgeIds: readonly string[]): VehicleState {
  return { edgeIds: [...edgeIds], index: 0, fraction: 0, arrived: edgeIds.length === 0 };
}

export function advanceVehicle(
  graph: Graph,
  state: VehicleState,
  dtS: number,
  incidents: readonly Incident[] | IncidentIndex,
  ctx: EvalContext,
  speedFactor = 1,
): VehicleState {
  if (state.arrived || dtS <= 0) return state;
  const index = 'sorted' in incidents ? incidents : buildIncidentIndex(incidents);
  let { index: i, fraction } = state;
  let remaining = dtS;
  while (remaining > 0) {
    const id = state.edgeIds[i];
    const ei = id === undefined ? undefined : graph.edgeIndex.get(id);
    if (ei === undefined) return { ...state, index: i, fraction, arrived: true };
    const e = graph.edges[ei]!;
    const total = (e.timeS * edgeMultiplier(e, index, ctx)) / speedFactor;
    const left = (1 - fraction) * total;
    if (total <= 0 || remaining < left) {
      fraction = total <= 0 ? 1 : fraction + remaining / total;
      remaining = 0;
    } else {
      remaining -= left;
      if (i + 1 >= state.edgeIds.length) return { ...state, index: i, fraction: 1, arrived: true };
      i += 1;
      fraction = 0;
    }
  }
  return { ...state, index: i, fraction: Math.min(1, fraction), arrived: false };
}

export function vehiclePosition(
  graph: Graph,
  state: VehicleState,
): { point: LatLng; headingDeg: number; edgeId: string } | null {
  const id = state.edgeIds[state.index];
  const ei = id === undefined ? undefined : graph.edgeIndex.get(id);
  if (ei === undefined) return null;
  const e = graph.edges[ei]!;
  const p = pointAlong(e.geometry, edgeCumulative(e), state.fraction);
  return { point: p.point, headingDeg: p.headingDeg, edgeId: e.id };
}

/** Distance travelled so far along the followed route, metres. */
export function travelledM(graph: Graph, state: VehicleState): number {
  let m = 0;
  for (let i = 0; i < state.index; i++) {
    const ei = graph.edgeIndex.get(state.edgeIds[i]!);
    if (ei !== undefined) m += graph.edges[ei]!.lengthM;
  }
  const cur = graph.edgeIndex.get(state.edgeIds[state.index] ?? '');
  if (cur !== undefined) m += graph.edges[cur]!.lengthM * state.fraction;
  return m;
}

/**
 * Route the vehicle follows after a re-plan: the edge it is on (or its reverse for a reversal)
 * followed by the recommended route. Returns the new state with progress carried over.
 */
export function followPlan(graph: Graph, state: VehicleState, plan: PlanResult): VehicleState {
  const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
  if (!rec || !plan.vehicle) return state;
  const current = graph.edgeIndex.get(plan.vehicle.edgeId);
  if (current === undefined) return state;
  if (plan.isReversal) {
    const rev = graph.edges[current]!.reverseIdx;
    if (rev < 0) return state;
    return { edgeIds: [graph.edges[rev]!.id, ...rec.edgeIds], index: 0, fraction: 1 - state.fraction, arrived: false };
  }
  return { edgeIds: [plan.vehicle.edgeId, ...rec.edgeIds], index: 0, fraction: state.fraction, arrived: false };
}

/** Remaining ETA in seconds: rest of the current edge plus the rest of the followed route. */
export function remainingEtaS(
  graph: Graph,
  state: VehicleState,
  incidents: readonly Incident[] | IncidentIndex,
  ctx: EvalContext,
): number {
  const index = 'sorted' in incidents ? incidents : buildIncidentIndex(incidents);
  let s = 0;
  for (let i = state.index; i < state.edgeIds.length; i++) {
    const ei = graph.edgeIndex.get(state.edgeIds[i]!);
    if (ei === undefined) continue;
    const e = graph.edges[ei]!;
    const t = e.timeS * edgeMultiplier(e, index, ctx);
    s += i === state.index ? (1 - state.fraction) * t : t;
  }
  return Math.round(s);
}
