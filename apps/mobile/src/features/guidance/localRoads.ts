import type { LatLng, Profile } from '@vighnaway/contracts';
import { haversineM } from '@vighnaway/engine';
import type { GuidePoint } from './guide';

/**
 * The last stretch between a place that is not on a mapped road (a campus, a housing society, a market
 * lane) and the road network the engine plans on. The roads come from OpenStreetMap, fetched for just
 * the area around the place; the shortest way along them to the first road the engine knows is found
 * here. It only shows and guides the access: the engine alone ranks the routes.
 */

export interface OsmWay {
  id: number;
  tags: Record<string, string>;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
}

const MOTOR = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'service', 'living_street', 'road', 'track']);
const WALK = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'service', 'living_street', 'road', 'track', 'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'corridor']);
const NO = new Set(['no']);

/** Typical speeds on local roads (km/h): slow on purpose, they are narrow and busy with people. */
const LOCAL_SPEED_KMH: Record<Profile, number> = { car: 20, two_wheeler: 20, foot: 4.5, step_free: 4 };

export const localSpeedKmh = (profile: Profile): number => LOCAL_SPEED_KMH[profile];

/** The OSM highways a profile may use. Nothing here is a guess about private land beyond access=no. */
export function wayAllowed(tags: Record<string, string>, profile: Profile): boolean {
  const hw = tags.highway;
  if (!hw) return false;
  if (profile === 'car' || profile === 'two_wheeler') {
    if (!MOTOR.has(hw)) return false;
    if (NO.has(tags.access ?? '') || NO.has(tags.motor_vehicle ?? '') || (profile === 'two_wheeler' && NO.has(tags.motorcycle ?? ''))) return false;
    return true;
  }
  if (!WALK.has(hw)) return false;
  if (hw === 'steps' && profile === 'step_free') return false;
  return !NO.has(tags.access ?? '') && !NO.has(tags.foot ?? '');
}

/** +1 forward only, -1 reverse only, 0 both ways. Walkers ignore one-way. */
function direction(tags: Record<string, string>, profile: Profile): 1 | -1 | 0 {
  if (profile === 'foot' || profile === 'step_free') return 0;
  const v = tags.oneway;
  if (v === 'yes' || v === 'true' || v === '1') return 1;
  if (v === '-1' || v === 'reverse') return -1;
  if (v === 'no') return 0;
  return tags.junction === 'roundabout' || tags.highway === 'motorway' || tags.highway === 'motorway_link' ? 1 : 0;
}

interface Arc {
  to: number;
  m: number;
  name: string | null;
  wayId: number;
}

export interface LocalGraph {
  pos: Map<number, LatLng>;
  adj: Map<number, Arc[]>;
  /** Ways that meet here, so a junction can be told from a bend. */
  ways: Map<number, Set<number>>;
}

/** `reverse` flips every one-way, to search outwards from a destination. */
export function buildLocalGraph(ways: readonly OsmWay[], profile: Profile, reverse = false): LocalGraph {
  const g: LocalGraph = { pos: new Map(), adj: new Map(), ways: new Map() };
  for (const w of ways) {
    if (!wayAllowed(w.tags, profile) || !w.nodes || w.nodes.length < 2 || w.geometry.length !== w.nodes.length) continue;
    const name = w.tags.name ?? w.tags.ref ?? null;
    const dir = reverse ? (-direction(w.tags, profile) as 1 | -1 | 0) : direction(w.tags, profile);
    for (let i = 0; i < w.nodes.length; i++) {
      const id = w.nodes[i]!;
      g.pos.set(id, { lat: w.geometry[i]!.lat, lng: w.geometry[i]!.lon });
      (g.ways.get(id) ?? g.ways.set(id, new Set()).get(id)!).add(w.id);
    }
    for (let i = 0; i < w.nodes.length - 1; i++) {
      const a = w.nodes[i]!;
      const b = w.nodes[i + 1]!;
      const m = haversineM(g.pos.get(a)!, g.pos.get(b)!);
      if (dir >= 0) (g.adj.get(a) ?? g.adj.set(a, []).get(a)!).push({ to: b, m, name, wayId: w.id });
      if (dir <= 0) (g.adj.get(b) ?? g.adj.set(b, []).get(b)!).push({ to: a, m, name, wayId: w.id });
    }
  }
  return g;
}

/** A small binary min-heap on distance. */
class Heap {
  private d: number[] = [];
  private n: number[] = [];
  get size(): number {
    return this.d.length;
  }
  push(node: number, dist: number): void {
    this.d.push(dist);
    this.n.push(node);
    let i = this.d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p]! <= this.d[i]!) break;
      [this.d[p], this.d[i]] = [this.d[i]!, this.d[p]!];
      [this.n[p], this.n[i]] = [this.n[i]!, this.n[p]!];
      i = p;
    }
  }
  pop(): { node: number; dist: number } {
    const top = { node: this.n[0]!, dist: this.d[0]! };
    const ld = this.d.pop()!;
    const ln = this.n.pop()!;
    if (this.d.length > 0) {
      this.d[0] = ld;
      this.n[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.d.length && this.d[l]! < this.d[m]!) m = l;
        if (r < this.d.length && this.d[r]! < this.d[m]!) m = r;
        if (m === i) break;
        [this.d[m], this.d[i]] = [this.d[i]!, this.d[m]!];
        [this.n[m], this.n[i]] = [this.n[i]!, this.n[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** Nearest local node to a point, within `maxM`. */
export function nearestNode(g: LocalGraph, p: LatLng, maxM: number, usable?: (id: number) => boolean): { id: number; distM: number } | null {
  let best: { id: number; distM: number } | null = null;
  for (const [id, q] of g.pos) {
    if (usable && !usable(id)) continue;
    // A cheap box test first: most nodes are far away.
    if (Math.abs(q.lat - p.lat) > maxM / 110000 || Math.abs(q.lng - p.lng) > maxM / 90000) continue;
    const d = haversineM(p, q);
    if (d <= maxM && (!best || d < best.distM)) best = { id, distM: d };
  }
  return best;
}

export interface AccessLeg {
  /** Where the leg meets the road network the engine plans on: its node id there. */
  entryNodeId: string;
  entryPoint: LatLng;
  points: GuidePoint[];
  lengthM: number;
}

/** The start must be this close to a local road for the leg to begin there (the rest is a straight link). */
export const START_SNAP_M = 150;

/** How many entries to the road network are compared before one is chosen. */
const ENTRY_CANDIDATES = 8;
/** Walking the local roads further than this past the nearest entry never beats it. */
const ENTRY_SLACK_M = 2000;
/** A straight line understates a road; this is the usual allowance. */
const DETOUR = 1.15;

/**
 * The way along local roads from `from` to a node the engine's graph also has (`isEntry`). Dijkstra on
 * length finds the nearest few entries; the one with the least local road plus straight distance on to
 * `towards` is taken, so the leg joins the road on the side the trip is heading. `null` when no local
 * road leads to an entry.
 */
export function accessFrom(g: LocalGraph, from: LatLng, isEntry: (osmId: number) => boolean, towards: LatLng | null, maxLenM = 6000): AccessLeg | null {
  const start = nearestNode(g, from, START_SNAP_M, (id) => (g.adj.get(id)?.length ?? 0) > 0);
  if (!start) return null;
  const dist = new Map<number, number>([[start.id, 0]]);
  const prev = new Map<number, { from: number; arc: Arc }>();
  const heap = new Heap();
  heap.push(start.id, 0);
  const done = new Set<number>();
  const entries: { id: number; d: number; score: number }[] = [];
  while (heap.size > 0) {
    const { node, dist: d } = heap.pop();
    if (done.has(node)) continue;
    done.add(node);
    if (d > maxLenM) break;
    if (entries.length > 0 && d > entries[0]!.d + ENTRY_SLACK_M) break;
    if (isEntry(node)) {
      entries.push({ id: node, d, score: d + (towards ? DETOUR * haversineM(g.pos.get(node)!, towards) : 0) });
      if (entries.length >= ENTRY_CANDIDATES) break;
    }
    for (const arc of g.adj.get(node) ?? []) {
      const nd = d + arc.m;
      if (nd < (dist.get(arc.to) ?? Infinity)) {
        dist.set(arc.to, nd);
        prev.set(arc.to, { from: node, arc });
        heap.push(arc.to, nd);
      }
    }
  }
  if (entries.length === 0) return null;
  const entry = entries.reduce((a, b) => (b.score < a.score ? b : a)).id;
  const chain: { node: number; arc: Arc | null }[] = [];
  for (let n: number = entry; ; ) {
    const p = prev.get(n);
    chain.push({ node: n, arc: p?.arc ?? null });
    if (!p) break;
    n = p.from;
  }
  chain.reverse();
  const points: GuidePoint[] = [];
  // The straight link from where the traveller is to the nearest local road.
  const link = start.distM > 8;
  if (link) points.push({ ...from, junction: true, name: null });
  let lengthM = link ? start.distM : 0;
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i]!;
    const next = chain[i + 1];
    const junction = i === 0 || i === chain.length - 1 || (g.ways.get(c.node)?.size ?? 0) > 1;
    // The road that starts at this node is the one the next arc follows; the last node starts none.
    points.push({ ...g.pos.get(c.node)!, junction, name: next ? (next.arc?.name ?? null) : undefined });
    if (next?.arc) lengthM += next.arc.m;
  }
  return { entryNodeId: String(entry), entryPoint: g.pos.get(entry)!, points, lengthM };
}

/**
 * A leg found on the reversed graph (from a destination out to the road network), turned round into
 * the direction of travel: from the entry to the destination.
 */
export function reverseLeg(leg: AccessLeg): AccessLeg {
  const n = leg.points.length;
  const points: GuidePoint[] = leg.points
    .slice()
    .reverse()
    .map((p, j) => ({ lat: p.lat, lng: p.lng, junction: p.junction, name: j < n - 1 ? (leg.points[n - 2 - j]!.name ?? null) : undefined }));
  return { ...leg, points };
}

// ---------------------------------------------------------------------------------------------
// Fetching

const DEFAULT_MIRRORS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/** Overpass hosts from EXPO_PUBLIC_OVERPASS_URLS (comma separated), else the public mirrors. */
export function overpassMirrors(raw: string | undefined = process.env.EXPO_PUBLIC_OVERPASS_URLS): string[] {
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_MIRRORS;
}

export function overpassQuery(center: LatLng, radiusM: number, profile: Profile): string {
  const classes = profile === 'car' || profile === 'two_wheeler' ? [...MOTOR] : [...WALK];
  const filter = classes.filter((c) => c !== 'motorway' && c !== 'motorway_link').join('|');
  return `[out:json][timeout:25];way(around:${Math.round(radiusM)},${center.lat.toFixed(6)},${center.lng.toFixed(6)})["highway"~"^(${filter})$"];out body geom;`;
}

const cache = new Map<string, OsmWay[]>();
const cacheKey = (c: LatLng, r: number, p: Profile) => `${c.lat.toFixed(3)},${c.lng.toFixed(3)}|${Math.round(r / 250)}|${p === 'foot' || p === 'step_free' ? 'walk' : 'drive'}`;

/** Fetch the local ways, trying each mirror in turn. Throws when none answers. Cached for the session. */
export async function fetchLocalWays(center: LatLng, radiusM: number, profile: Profile, signal?: AbortSignal): Promise<OsmWay[]> {
  const key = cacheKey(center, radiusM, profile);
  const hit = cache.get(key);
  if (hit) return hit;
  const body = 'data=' + encodeURIComponent(overpassQuery(center, radiusM, profile));
  let last = 'no mirror';
  for (const url of overpassMirrors()) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal });
      if (!res.ok) {
        last = `${url} HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as { elements?: { type: string; id: number; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[] }[] };
      const ways: OsmWay[] = (json.elements ?? [])
        .filter((e) => e.type === 'way' && e.nodes && e.geometry)
        .map((e) => ({ id: e.id, tags: e.tags ?? {}, nodes: e.nodes!, geometry: e.geometry! }));
      if (cache.size > 6) cache.clear();
      cache.set(key, ways);
      return ways;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = `${url} ${(e as Error).message}`;
    }
  }
  throw new Error(`OpenStreetMap roads could not be fetched (${last})`);
}

/** How far around the place to fetch: the gap to the road network, with room to wind about, within bounds. */
export function fetchRadiusM(gapM: number): number {
  return Math.min(2500, Math.max(700, Math.round(gapM * 1.6 + 300)));
}
