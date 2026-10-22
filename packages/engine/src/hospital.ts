import { HOSPITAL_STATES, type HospitalStateValue, type Incident, type LatLng, type Place } from '@vighnaway/contracts';
import { evaluate } from './evaluate';
import { snapToNode, type Graph } from './graph';
import { buildIncidentIndex, type EvalContext, type IncidentIndex } from './incidents';
import { dijkstraIdx } from './paths';
import { awareWeight } from './plan';
import { SCORING_RULES } from './rules';

/**
 * Hospital load spreading (P2-4). When several trips ask for "the nearest hospital", each trip takes
 * the hospital with the lowest ranking cost: arrival time, plus a penalty for the hospital's state
 * (set by an operator), plus a penalty for each trip already assigned to it in this batch. Pure and
 * deterministic: trips are handled in id order and ties go to the lower hospital id. Ranking only:
 * the arrival time shown to the traveller is unchanged, and an unreachable hospital is never assigned.
 */

export { HOSPITAL_STATES };
export type HospitalState = HospitalStateValue;

export interface HospitalTrip {
  id: string;
  origin: string | LatLng;
}

export type AssignmentReason =
  /** The hospital with the shortest arrival time was assigned. */
  | 'nearest'
  /** A hospital further away was assigned because the nearest one was busy, diverting or already taking trips. */
  | 'spread'
  /** No hospital is reachable. */
  | 'none';

export interface HospitalAssignment {
  tripId: string;
  placeId: string | null;
  etaS: number | null;
  reason: AssignmentReason;
  /** For `spread`: the nearer hospital that was passed over, and why. */
  passedOver: { placeId: string; state: HospitalState; alreadyAssigned: number } | null;
}

export interface AssignHospitalsInput {
  graph: Graph;
  trips: readonly HospitalTrip[];
  places: readonly Place[];
  /** Operator-set state per hospital id; a missing hospital is accepting. */
  states?: Readonly<Record<string, HospitalState>>;
  incidents: readonly Incident[] | IncidentIndex;
  ctx: EvalContext;
}

export const hospitalStateCostS = (state: HospitalState): number => {
  const v = SCORING_RULES.hospitalLoad.value;
  return state === 'busy' ? v.busyS : state === 'diverting' ? v.divertingS : 0;
};

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function assignHospitals(input: AssignHospitalsInput): HospitalAssignment[] {
  const { graph, ctx } = input;
  const index = 'sorted' in input.incidents ? input.incidents : buildIncidentIndex(input.incidents);
  const hospitals = input.places.filter((p) => p.kind === 'hospital').sort(byId);
  const weight = awareWeight(graph, index, ctx);
  const assigned = new Map<string, number>();
  const out: HospitalAssignment[] = [];

  for (const trip of [...input.trips].sort(byId)) {
    const originId = typeof trip.origin === 'string' ? trip.origin : snapToNode(graph, trip.origin);
    const from = originId === null ? undefined : graph.nodeIndex.get(originId);
    const options: Array<{ place: Place; etaS: number; costS: number }> = [];
    if (from !== undefined) {
      for (const place of hospitals) {
        const to = graph.nodeIndex.get(place.nodeId);
        if (to === undefined || to === from) continue;
        const path = dijkstraIdx(graph, from, to, weight);
        if (!path) continue;
        const ev = evaluate(graph, path.edges, index, ctx);
        if (!ev.viable) continue;
        const state = input.states?.[place.id] ?? 'accepting';
        const load = (assigned.get(place.id) ?? 0) * SCORING_RULES.hospitalLoad.value.perAssignedS;
        options.push({ place, etaS: ev.etaS, costS: ev.etaS + hospitalStateCostS(state) + load });
      }
    }
    if (!options.length) {
      out.push({ tripId: trip.id, placeId: null, etaS: null, reason: 'none', passedOver: null });
      continue;
    }
    // Hospitals were visited in id order, so a stable sort by cost keeps the lower id on ties.
    const best = [...options].sort((a, b) => a.costS - b.costS)[0]!;
    const nearest = [...options].sort((a, b) => a.etaS - b.etaS)[0]!;
    assigned.set(best.place.id, (assigned.get(best.place.id) ?? 0) + 1);
    const spread = best.place.id !== nearest.place.id;
    out.push({
      tripId: trip.id,
      placeId: best.place.id,
      etaS: best.etaS,
      reason: spread ? 'spread' : 'nearest',
      passedOver: spread
        ? {
            placeId: nearest.place.id,
            state: input.states?.[nearest.place.id] ?? 'accepting',
            // Trips on that hospital before this one was assigned.
            alreadyAssigned: assigned.get(nearest.place.id) ?? 0,
          }
        : null,
    });
  }
  return out;
}
