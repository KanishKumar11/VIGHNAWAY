import type { LatLng } from '@vighnaway/contracts';
import { haversineM, nodePoint, snapToNode, type Graph } from '@vighnaway/engine';
import { getGraph } from '@/lib/engine';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useTrip } from '@/stores/trip';
import { useGuidance } from '@/stores/guidance';
import { schedulePlan } from '@/features/trip/planner';
import { accessFrom, buildLocalGraph, fetchLocalWays, fetchRadiusM, reverseLeg, type AccessLeg } from './localRoads';

/** A start or end this close to a mapped road needs no local leg. */
export const LOCAL_GAP_MIN_M = 80;
/** Beyond this the local roads are not fetched at all (the trip is refused much earlier than this). */
const LOCAL_GAP_MAX_M = 3500;

/** Key of the trip the legs are for. */
export function accessKey(): string {
  const { originId, destinationId } = useTrip.getState();
  return `${useSettings.getState().profile}|${originId}|${destinationId ?? 'none'}`;
}

/** The engine's node the trip's start (or end) would use if there were no local road, and how far away it is. */
function gapTo(graph: Graph, point: LatLng): number {
  const id = snapToNode(graph, point);
  const idx = id === null ? undefined : graph.nodeIndex.get(id);
  return idx === undefined ? Infinity : haversineM(point, nodePoint(graph, idx));
}

/** A node of the engine's graph that the profile can both enter and leave: where a trip may join. */
function entryTest(graph: Graph): (osmId: number) => boolean {
  const hasIn = new Uint8Array(graph.nodeIds.length);
  for (const e of graph.edges) hasIn[e.to] = 1;
  return (osmId) => {
    const idx = graph.nodeIndex.get(String(osmId));
    return idx !== undefined && graph.out[idx]!.length > 0 && hasIn[idx] === 1;
  };
}

let run = 0;

/**
 * Finds the local roads from the start (and to the destination) to the road network, from OpenStreetMap,
 * and stores them. Needs a network; without one the status is "failed" and the trip plans exactly as
 * before (the note about the gap to the mapped road stays). Only the corridor map: Andheri's graph
 * already has every street.
 */
export async function loadAccess(): Promise<void> {
  const mine = ++run;
  const g = useGuidance.getState();
  const trip = useTrip.getState();
  const { scenario, graphFile, region } = useScenario.getState();
  const origin = placeById(scenario, trip.originId);
  const dest = placeById(scenario, trip.destinationId);
  const key = accessKey();
  // The legs stay while a trip runs: the guidance follows them.
  if (trip.mode !== 'planning') return;
  if (region === 'andheri' || !origin || !dest) {
    if (g.status !== 'idle' || g.from || g.to) g.reset();
    return;
  }
  const { profile } = useSettings.getState();
  const graph = getGraph(graphFile, profile);
  const fromGap = gapTo(graph, origin.point);
  const toGap = gapTo(graph, dest.point);
  const needFrom = fromGap >= LOCAL_GAP_MIN_M && fromGap <= LOCAL_GAP_MAX_M;
  const needTo = toGap >= LOCAL_GAP_MIN_M && toGap <= LOCAL_GAP_MAX_M;
  if (!needFrom && !needTo) {
    useGuidance.getState().setLegs(key, null, null);
    return;
  }
  if (useGuidance.getState().key === key && useGuidance.getState().status === 'ready') return;
  useGuidance.getState().setStatus('loading', key);
  const isEntry = entryTest(graph);
  try {
    const leg = async (point: LatLng, gap: number, towards: LatLng, toEnd: boolean): Promise<AccessLeg | null> => {
      const ways = await fetchLocalWays(point, fetchRadiusM(gap), profile);
      const local = buildLocalGraph(ways, profile, toEnd);
      const found = accessFrom(local, point, isEntry, towards);
      return found ? (toEnd ? reverseLeg(found) : found) : null;
    };
    const [fromLeg, toLeg] = await Promise.all([
      needFrom ? leg(origin.point, fromGap, dest.point, false) : null,
      needTo ? leg(dest.point, toGap, origin.point, true) : null,
    ]);
    if (mine !== run) return;
    useGuidance.getState().setLegs(key, fromLeg, toLeg);
    // The trip may now join the network at a different node: plan again from there.
    schedulePlan({ delayMs: 0 });
  } catch {
    if (mine !== run) return;
    useGuidance.getState().setStatus('failed', key);
  }
}

/** The node of the engine's graph the trip should start or end at because of a local leg, if one was found. */
export function entryNodeFor(role: 'from' | 'to'): string | null {
  const s = useGuidance.getState();
  if (s.key !== accessKey() || s.status !== 'ready') return null;
  return (role === 'from' ? s.from : s.to)?.entryNodeId ?? null;
}
