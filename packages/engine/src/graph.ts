import type { GraphFile, LatLng, LngLatTuple, Profile, RoadEdge } from '@vighnaway/contracts';
import { cumulativeLengths, haversineM, projectOnSegment, tupleToLatLng } from './geo';
import { SCORING_RULES } from './rules';

export interface GEdge {
  idx: number;
  /** Profile edge id. Equals baseId except for on-foot virtual reverses of one-way edges. */
  id: string;
  /** Edge id in graph.json; incidents reference these. */
  baseId: string;
  from: number;
  to: number;
  /** Index of the opposite-direction edge in this profile graph, or -1. */
  reverseIdx: number;
  name: string | null;
  highway: string;
  bridge: boolean;
  tunnel: boolean;
  layer: number;
  lengthM: number;
  floodProne: boolean;
  /** OpenStreetMap lit=yes/no, or null where the map does not say (P2-9). */
  lit: boolean | null;
  /** Free-flow travel time for this profile, seconds (unrounded). */
  timeS: number;
  geometry: readonly LngLatTuple[];
  virtual: boolean;
}

export interface Graph {
  version: string;
  source: GraphFile['source'];
  attribution: string;
  profile: Profile;
  nodeIds: string[];
  nodeIndex: Map<string, number>;
  nodeLat: Float64Array;
  nodeLng: Float64Array;
  edges: GEdge[];
  edgeIndex: Map<string, number>;
  /** graph.json edge id -> profile edge indices (the edge itself and any virtual reverse). */
  edgesByBase: Map<string, number[]>;
  /** Outgoing edge indices per node, ascending edge id. */
  out: number[][];
  /** Fastest speed in this graph, m/s (A* heuristic bound). */
  maxSpeedMps: number;
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Walking profiles: foot, and step-free (foot without mapped steps). */
export const isWalking = (profile: Profile): boolean => profile === 'foot' || profile === 'step_free';

export function isEdgeAllowed(e: RoadEdge, profile: Profile): boolean {
  const rules = SCORING_RULES.access.value;
  const yes = (v: string | null) => v === 'yes' || v === 'designated' || v === 'permissive';
  const noAccess = e.access === 'no' || e.access === 'private';
  if (profile === 'step_free' && (SCORING_RULES.stepFree.value.avoidedHighways as readonly string[]).includes(e.highway)) return false;
  if (isWalking(profile)) {
    if (e.foot === 'no') return false;
    if (yes(e.foot)) return true;
    if ((rules.footExcludedHighways as readonly string[]).includes(e.highway)) return false;
    return !noAccess;
  }
  if ((rules.motorExcludedHighways as readonly string[]).includes(e.highway)) return false;
  if (e.motorVehicle === 'no' || e.motorVehicle === 'private') return false;
  if (yes(e.motorVehicle)) return true;
  return !noAccess;
}

export function speedKmh(highway: string, profile: Profile): number {
  const table = SCORING_RULES.speedsKmh.value[profile] as Record<string, number>;
  if (isWalking(profile)) return table[highway] ?? table.default ?? SCORING_RULES.defaultSpeedKmh.value[profile];
  return table[highway] ?? SCORING_RULES.defaultSpeedKmh.value[profile];
}

/**
 * Builds adjacency lists for one profile: only edges the profile may use, with profile speeds.
 * Build once per (graph version, profile) and reuse; the result is never mutated.
 */
export function loadGraph(json: GraphFile, profile: Profile): Graph {
  const nodeIds = json.nodes.map((n) => n.id).sort(byString);
  const nodeIndex = new Map<string, number>();
  nodeIds.forEach((id, i) => nodeIndex.set(id, i));
  const nodeLat = new Float64Array(nodeIds.length);
  const nodeLng = new Float64Array(nodeIds.length);
  for (const n of json.nodes) {
    const i = nodeIndex.get(n.id)!;
    nodeLat[i] = n.lat;
    nodeLng[i] = n.lng;
  }

  type Draft = Omit<GEdge, 'idx' | 'reverseIdx'> & { reverseId: string | null };
  const drafts: Draft[] = [];
  const baseIds = new Set(json.edges.map((e) => e.id));
  for (const e of json.edges) {
    if (!isEdgeAllowed(e, profile)) continue;
    const from = nodeIndex.get(e.from);
    const to = nodeIndex.get(e.to);
    if (from === undefined || to === undefined) continue;
    // A region may carry its own typical speeds (GraphFile.speedsKmh); otherwise the engine table applies.
    const regional = json.speedsKmh?.[profile] ?? (profile === 'step_free' ? json.speedsKmh?.foot : undefined);
    const kmh = regional?.[e.highway] ?? (isWalking(profile) ? regional?.default : undefined) ?? speedKmh(e.highway, profile);
    const timeS = e.lengthM / (kmh / 3.6);
    const common = {
      baseId: e.id,
      name: e.name,
      highway: e.highway,
      bridge: e.bridge,
      tunnel: e.tunnel,
      layer: e.layer,
      lengthM: e.lengthM,
      floodProne: e.floodProne,
      lit: e.lit ?? null,
      timeS,
    };
    drafts.push({ ...common, id: e.id, from, to, geometry: e.geometry, virtual: false, reverseId: e.reverseId });
    // On foot, one-way streets can be walked in both directions.
    const twinExists = e.reverseId !== null && baseIds.has(e.reverseId);
    if (isWalking(profile) && !twinExists) {
      drafts.push({
        ...common,
        id: `${e.id}~r`,
        from: to,
        to: from,
        geometry: [...e.geometry].reverse(),
        virtual: true,
        reverseId: e.id,
      });
    }
  }
  drafts.sort((a, b) => byString(a.id, b.id));

  const edgeIndex = new Map<string, number>();
  drafts.forEach((d, i) => edgeIndex.set(d.id, i));
  const edges: GEdge[] = drafts.map((d, idx) => {
    const { reverseId, ...rest } = d;
    let reverseIdx = -1;
    if (d.virtual) reverseIdx = edgeIndex.get(d.baseId) ?? -1;
    else if (reverseId !== null) reverseIdx = edgeIndex.get(reverseId) ?? edgeIndex.get(`${d.id}~r`) ?? -1;
    else reverseIdx = edgeIndex.get(`${d.id}~r`) ?? -1;
    return { ...rest, idx, reverseIdx };
  });

  const edgesByBase = new Map<string, number[]>();
  for (const e of edges) {
    const list = edgesByBase.get(e.baseId);
    if (list) list.push(e.idx);
    else edgesByBase.set(e.baseId, [e.idx]);
  }

  const out: number[][] = nodeIds.map(() => []);
  for (const e of edges) out[e.from]!.push(e.idx);

  let maxSpeedMps = 0;
  for (const e of edges) if (e.timeS > 0) maxSpeedMps = Math.max(maxSpeedMps, e.lengthM / e.timeS);

  return {
    version: json.graphVersion,
    source: json.source,
    attribution: json.attribution,
    profile,
    nodeIds,
    nodeIndex,
    nodeLat,
    nodeLng,
    edges,
    edgeIndex,
    edgesByBase,
    out,
    maxSpeedMps: maxSpeedMps || 1,
  };
}

export function nodePoint(graph: Graph, idx: number): LatLng {
  return { lat: graph.nodeLat[idx]!, lng: graph.nodeLng[idx]! };
}

/** Nearest node that the profile can leave and enter. Ties go to the smaller node id. */
export function snapToNode(graph: Graph, point: LatLng): string | null {
  const hasIn = new Uint8Array(graph.nodeIds.length);
  for (const e of graph.edges) hasIn[e.to] = 1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < graph.nodeIds.length; i++) {
    if (graph.out[i]!.length === 0 || !hasIn[i]) continue;
    const d = haversineM(point, nodePoint(graph, i));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? null : graph.nodeIds[best]!;
}

const cumulativeCache = new WeakMap<GEdge, number[]>();
export function edgeCumulative(edge: GEdge): number[] {
  let c = cumulativeCache.get(edge);
  if (!c) {
    c = cumulativeLengths(edge.geometry);
    cumulativeCache.set(edge, c);
  }
  return c;
}

export interface EdgeSnap {
  edgeId: string;
  baseId: string;
  /** Fraction of the edge's length from its start. */
  fraction: number;
  distanceM: number;
}

/** Nearest edge to a point, optionally restricted to a set of edge ids. */
export function snapToEdge(graph: Graph, point: LatLng, onlyEdgeIds?: readonly string[]): EdgeSnap | null {
  const indices = onlyEdgeIds
    ? onlyEdgeIds.map((id) => graph.edgeIndex.get(id)).filter((i): i is number => i !== undefined)
    : graph.edges.map((e) => e.idx);
  let best: EdgeSnap | null = null;
  for (const idx of indices) {
    const e = graph.edges[idx]!;
    const cum = edgeCumulative(e);
    const total = cum[cum.length - 1] || 1;
    for (let s = 1; s < e.geometry.length; s++) {
      const a = tupleToLatLng(e.geometry[s - 1]!);
      const b = tupleToLatLng(e.geometry[s]!);
      const { t, distanceM } = projectOnSegment(point, a, b);
      if (!best || distanceM < best.distanceM - 1e-9) {
        const along = cum[s - 1]! + t * (cum[s]! - cum[s - 1]!);
        best = { edgeId: e.id, baseId: e.baseId, fraction: along / total, distanceM };
      }
    }
  }
  return best;
}
