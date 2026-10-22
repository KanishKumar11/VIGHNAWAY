/**
 * Pure drawing helpers for the schematic map and the sheet (no React, fully unit-tested):
 * corner smoothing for SVG paths, greedy label placement with collision avoidance, an approximate
 * railway line through the crossings, and ETA delta bars for the route comparison.
 */
import type { GraphFile, LngLatTuple, RouteEvaluation } from '@vighnaway/contracts';
import { fmtDelta } from '@/i18n/format';

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Drops consecutive points closer than `eps` (joined edges repeat their shared node). */
export function dedupePoints(points: readonly Pt[], eps = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) >= eps) out.push(p);
  }
  return out;
}

/** Distance from p to the segment ab. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}

/**
 * Douglas-Peucker simplification: drops points closer than `tolerance` px to the simplified line,
 * so hand-digitised wiggles read as clean cartography. Endpoints are always kept.
 */
export function simplifyPath(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = segDist(points[i]!, points[i0]!, points[i1]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > 0 && maxD > tolerance) {
      keep[idx] = true;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Total length of a polyline. */
export function polylineLength(points: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1]!, points[i]!);
  return len;
}

/**
 * SVG path through the points with every interior corner rounded by a quadratic curve of at most
 * `radius`, clamped to half of each adjacent segment so neighbouring curves never overlap.
 * Endpoints are kept exactly; a two-point input stays a straight line.
 */
export function smoothPath(input: readonly Pt[], radius: number): string {
  const pts = dedupePoints(input);
  if (pts.length === 0) return '';
  const first = pts[0]!;
  if (pts.length === 1) return `M${r1(first.x)} ${r1(first.y)}`;
  let d = `M${r1(first.x)} ${r1(first.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const d1 = dist(prev, cur);
    const d2 = dist(cur, next);
    const rr = Math.min(radius, d1 / 2, d2 / 2);
    if (rr <= 0.01) {
      d += ` L${r1(cur.x)} ${r1(cur.y)}`;
      continue;
    }
    const a = { x: cur.x - ((cur.x - prev.x) / d1) * rr, y: cur.y - ((cur.y - prev.y) / d1) * rr };
    const b = { x: cur.x + ((next.x - cur.x) / d2) * rr, y: cur.y + ((next.y - cur.y) / d2) * rr };
    d += ` L${r1(a.x)} ${r1(a.y)} Q${r1(cur.x)} ${r1(cur.y)} ${r1(b.x)} ${r1(b.y)}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L${r1(last.x)} ${r1(last.y)}`;
  return d;
}

/** Points every `step` px along a polyline (vertices included), for collision tests along lines. */
export function samplePolyline(points: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  if (!points.length) return out;
  out.push(points[0]!);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / Math.max(1, step)));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Point and heading (degrees, 0 = up/north, clockwise) at `fraction` (0..1) of a polyline. */
export function pointAtFraction(points: readonly Pt[], fraction: number): { p: Pt; headingDeg: number } | null {
  if (points.length < 2) return null;
  const total = polylineLength(points);
  let target = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = dist(a, b);
    if (target <= seg || i === points.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, target / seg);
      const headingDeg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, headingDeg };
    }
    target -= seg;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Labels

export interface LabelCandidate {
  id: string;
  text: string;
  /** Anchor (label centre). */
  x: number;
  y: number;
  /** Higher wins when two labels collide. */
  priority: number;
  w: number;
  h: number;
}

export interface PlacedLabel extends LabelCandidate {
  rect: Rect;
}

/** Width of a monospaced label: every glyph is `ratio` × font size wide, plus tracking. */
export function estimateMonoWidth(text: string, fontSize: number, tracking = 0, ratio = 0.6): number {
  return text.length * (fontSize * ratio + tracking);
}

export const rectsOverlap = (a: Rect, b: Rect, gap = 0): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const inside = (r: Rect, b: Rect) => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;

/**
 * Greedy placement: highest priority first; each label tries its anchor, then just above and
 * just below it, and is dropped when every slot collides with a placed label or an obstacle
 * (markers, pins) or leaves the visible bounds. Deterministic for equal priorities (by id).
 */
export function placeLabels(candidates: readonly LabelCandidate[], obstacles: readonly Rect[], bounds: Rect, gap = 4): PlacedLabel[] {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: PlacedLabel[] = [];
  for (const c of sorted) {
    const offsets = [0, -(c.h + gap), c.h + gap];
    for (const dy of offsets) {
      const rect = { x: c.x - c.w / 2, y: c.y + dy - c.h / 2, w: c.w, h: c.h };
      if (!inside(rect, bounds)) continue;
      if (placed.some((p) => rectsOverlap(p.rect, rect, gap))) continue;
      if (obstacles.some((o) => rectsOverlap(o, rect))) continue;
      placed.push({ ...c, y: c.y + dy, rect });
      break;
    }
  }
  return placed;
}

// ---------------------------------------------------------------------------------------------
// Railway

/**
 * Approximate railway line for the schematic view: the road graph has no railway, but every
 * bridge and tunnel in it crosses the line. Passes through the crossing midpoints (sorted south to
 * north) and is extended to the bounding box along the least-squares direction. Null when fewer
 * than two crossings exist.
 */
export function approximateRailway(file: Pick<GraphFile, 'edges' | 'bbox'>): LngLatTuple[] | null {
  const pts: { lat: number; lng: number }[] = [];
  const seen = new Set<string>();
  for (const e of file.edges) {
    if (!(e.bridge || e.tunnel) || seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.reverseId) seen.add(e.reverseId);
    const mid = e.geometry[Math.floor((e.geometry.length - 1) / 2)]!;
    const next = e.geometry[Math.min(e.geometry.length - 1, Math.floor((e.geometry.length - 1) / 2) + 1)]!;
    pts.push({ lng: (mid[0] + next[0]) / 2, lat: (mid[1] + next[1]) / 2 });
  }
  if (pts.length < 2) return null;
  const n = pts.length;
  const mLat = pts.reduce((s, p) => s + p.lat, 0) / n;
  const mLng = pts.reduce((s, p) => s + p.lng, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.lat - mLat) * (p.lng - mLng);
    den += (p.lat - mLat) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const lngAt = (lat: number, from: { lat: number; lng: number }) => from.lng + (lat - from.lat) * slope;
  pts.sort((a, b) => a.lat - b.lat);
  const south = pts[0]!;
  const north = pts[pts.length - 1]!;
  const { bbox } = file;
  const out: LngLatTuple[] = [[lngAt(bbox.south, south), bbox.south]];
  for (const p of pts) out.push([p.lng, p.lat]);
  out.push([lngAt(bbox.north, north), bbox.north]);
  return out;
}

export interface ChainEdge {
  id: string;
  from: string;
  to: string;
  /** Edges chain only with the same key (e.g. road name + class + bridge/tunnel flags). */
  key: string;
  geometry: readonly (readonly [number, number])[];
}

/**
 * Joins undirected edges that share a node and a key into continuous polylines, so a road made
 * of many short edges can be simplified and smoothed as one line. Returns one coordinate list per
 * chain (deterministic order: by first edge id).
 */
export function chainEdges(edges: readonly ChainEdge[]): { key: string; ids: string[]; coords: [number, number][] }[] {
  const byKey = new Map<string, ChainEdge[]>();
  for (const e of edges) byKey.set(e.key, [...(byKey.get(e.key) ?? []), e]);
  const out: { key: string; ids: string[]; coords: [number, number][] }[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    const at = new Map<string, ChainEdge[]>();
    for (const e of sorted) {
      at.set(e.from, [...(at.get(e.from) ?? []), e]);
      at.set(e.to, [...(at.get(e.to) ?? []), e]);
    }
    const used = new Set<string>();
    // Start at chain ends (nodes touching one edge) first, then whatever is left (loops).
    const starts = [...sorted.filter((e) => at.get(e.from)!.length !== 2 || at.get(e.to)!.length !== 2), ...sorted];
    for (const first of starts) {
      if (used.has(first.id)) continue;
      used.add(first.id);
      const fromEnd = at.get(first.from)!.length !== 2;
      let node = fromEnd ? first.to : first.from;
      const coords: [number, number][] = (fromEnd ? [...first.geometry] : [...first.geometry].reverse()).map(([a, b]) => [a, b]);
      const ids = [first.id];
      for (;;) {
        const next = (at.get(node) ?? []).find((e) => !used.has(e.id));
        if (!next || at.get(node)!.length !== 2) break;
        used.add(next.id);
        ids.push(next.id);
        const forward = next.from === node;
        const g = forward ? next.geometry : [...next.geometry].reverse();
        for (const [a, b] of g.slice(1)) coords.push([a, b]);
        node = forward ? next.to : next.from;
      }
      out.push({ key, ids, coords });
    }
  }
  return out.sort((a, b) => (a.ids[0]! < b.ids[0]! ? -1 : 1));
}

/** Road class for drawing weight. */
export function roadClass(highway: string): 'major' | 'minor' | 'path' {
  if (/^(motorway|trunk|primary)/.test(highway)) return 'major';
  if (/^(footway|path|pedestrian|steps|cycleway)/.test(highway)) return 'path';
  return 'minor';
}

// ---------------------------------------------------------------------------------------------
// Route comparison

export interface DeltaBar {
  routeId: string;
  /** Part of the bar up to the recommended route's ETA (0..1 of the longest ETA). */
  base: number;
  /** Extra part beyond the recommended ETA (0..1 of the longest ETA). */
  extra: number;
  /** Seconds compared with the recommended route (negative = faster). */
  deltaS: number;
  /** "+5 min", "−2 min" or '' for the recommended route itself. */
  label: string;
  viable: boolean;
}

/**
 * ETA delta bars: every bar is scaled to the longest ETA in the list; the part beyond the
 * recommended route's ETA is drawn separately so the trade-off reads at a glance. Bars never go
 * below `minFraction` so a short route still shows a bar.
 */
export function etaDeltaBars(routes: readonly Pick<RouteEvaluation, 'routeId' | 'etaS' | 'role' | 'viable'>[], recommendedId: string | null, minFraction = 0.08): DeltaBar[] {
  if (!routes.length) return [];
  const max = Math.max(1, ...routes.map((r) => r.etaS));
  const rec = routes.find((r) => r.routeId === recommendedId) ?? null;
  const recEta = rec?.etaS ?? null;
  return routes.map((r) => {
    const total = Math.max(minFraction, r.etaS / max);
    if (recEta === null) return { routeId: r.routeId, base: total, extra: 0, deltaS: 0, label: '', viable: r.viable };
    const deltaS = r.etaS - recEta;
    const base = Math.max(minFraction, Math.min(r.etaS, recEta) / max);
    const extra = deltaS > 0 ? Math.max(0, total - base) : 0;
    const label = r.routeId === recommendedId ? '' : Math.round(deltaS / 60) === 0 ? fmtDelta(0) : fmtDelta(deltaS);
    return { routeId: r.routeId, base, extra, deltaS, label, viable: r.viable };
  });
}

/** Splits "1 h 5 min" into number and unit runs for the hero ETA ("1", " h ", "5", " min"). */
export function splitNumberRuns(text: string): { text: string; numeric: boolean }[] {
  const out: { text: string; numeric: boolean }[] = [];
  for (const m of text.matchAll(/(\d+)|(\D+)/g)) out.push({ text: m[0], numeric: m[1] !== undefined });
  return out;
}
