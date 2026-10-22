import {
  alertContext,
  edgeCumulative,
  loadGraph,
  pointAlong,
  routeGeometry,
  type EvalContext,
  type Graph,
  type VehicleState,
} from '@vighnaway/engine';
import type { GraphFile, LatLng, LngLatTuple, Profile, Scenario } from '@vighnaway/contracts';

/** Profile graphs are built once per graph version and reused (they are never mutated). */
const graphs = new Map<string, Graph>();

export function getGraph(file: GraphFile, profile: Profile): Graph {
  const key = `${file.graphVersion}|${profile}`;
  let g = graphs.get(key);
  if (!g) {
    g = loadGraph(file, profile);
    graphs.set(key, g);
  }
  return g;
}

export function evalContext(scenario: Scenario, nowS: number): EvalContext {
  return alertContext(scenario.alerts, scenario.hasAlertInformation, nowS);
}

export const toLatLng = ([lng, lat]: LngLatTuple): LatLng => ({ lat, lng });

/** Map coordinates for a route (react-native-maps uses { latitude, longitude }). */
export interface MapCoord {
  latitude: number;
  longitude: number;
}

const coordCache = new Map<string, MapCoord[]>();

/** Memoised polyline coordinates for an edge list. */
export function routeCoords(graph: Graph, edgeIds: readonly string[], key?: string): MapCoord[] {
  const k = `${graph.version}|${graph.profile}|${key ?? edgeIds.join('|')}`;
  const hit = coordCache.get(k);
  if (hit) return hit;
  const coords = routeGeometry(graph, edgeIds).map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  if (coordCache.size > 200) coordCache.clear();
  coordCache.set(k, coords);
  return coords;
}

/** Coordinates already driven: whole edges before the vehicle plus the current edge up to it. */
export function travelledCoords(graph: Graph, vehicle: VehicleState): MapCoord[] {
  const done = vehicle.edgeIds.slice(0, vehicle.index);
  const out = [...routeCoords(graph, done)];
  const id = vehicle.edgeIds[vehicle.index];
  const ei = id === undefined ? undefined : graph.edgeIndex.get(id);
  if (ei === undefined) return out;
  const e = graph.edges[ei]!;
  const cum = edgeCumulative(e);
  const total = cum[cum.length - 1] ?? 0;
  const upTo = total * vehicle.fraction;
  for (let i = 0; i < e.geometry.length; i++) {
    if ((cum[i] ?? 0) > upTo) break;
    const [lng, lat] = e.geometry[i]!;
    const last = out[out.length - 1];
    if (!last || last.latitude !== lat || last.longitude !== lng) out.push({ latitude: lat, longitude: lng });
  }
  const p = pointAlong(e.geometry, cum, vehicle.fraction).point;
  out.push({ latitude: p.lat, longitude: p.lng });
  return out;
}

/** Midpoint of an edge, for the blocking cross marker. */
export function edgeMidpoint(graph: Graph, edgeId: string): LatLng | null {
  const ei = graph.edgeIndex.get(edgeId);
  if (ei === undefined) return null;
  const e = graph.edges[ei]!;
  return pointAlong(e.geometry, edgeCumulative(e), 0.5).point;
}

/** Ordered distinct road names along a route, for share text ("turns from edge names"). */
export function roadSequence(graph: Graph, edgeIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of edgeIds) {
    const ei = graph.edgeIndex.get(id);
    const name = ei === undefined ? null : graph.edges[ei]!.name;
    if (name && out[out.length - 1] !== name) out.push(name);
  }
  return out;
}

/** Flood-prone edges for the dotted underlay, one entry per two-way pair. */
export function floodProneSegments(graph: Graph): { id: string; coords: MapCoord[] }[] {
  const seen = new Set<string>();
  const out: { id: string; coords: MapCoord[] }[] = [];
  for (const e of graph.edges) {
    if (!e.floodProne || e.virtual) continue;
    const twin = e.reverseIdx >= 0 ? graph.edges[e.reverseIdx]!.id : null;
    if (twin && seen.has(twin)) continue;
    seen.add(e.id);
    out.push({ id: e.id, coords: e.geometry.map(([lng, lat]) => ({ latitude: lat, longitude: lng })) });
  }
  return out;
}
