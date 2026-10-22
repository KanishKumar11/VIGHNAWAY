import type { GraphFile, LngLatTuple } from '@vighnaway/contracts';

/**
 * Pure geometry for the schematic map (rendering only; routing never reads any of this):
 * rounded-corner paths, road chains, and label placement with collision avoidance.
 */
export interface Pt {
  x: number;
  y: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** Drops consecutive points closer than `eps` pixels (duplicate nodes, tiny jitter). */
export function dedupePoints(points: readonly Pt[], eps = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > eps) out.push(p);
  }
  return out;
}

/**
 * SVG path through `points` with every interior corner rounded by a quadratic curve. The corner
 * radius depends only on the corner and its two neighbours, so a route drawn over a road rounds
 * exactly like the road where they share vertices. Straight runs stay straight (no overshoot,
 * unlike Catmull-Rom), and the path still starts and ends on the original end points.
 */
export function roundedPath(points: readonly Pt[], radius: number): string {
  const pts = dedupePoints(points);
  if (pts.length < 2) return '';
  let d = `M${f1(pts[0]!.x)} ${f1(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const lin = dist(prev, cur);
    const lout = dist(cur, next);
    const r = Math.min(radius, lin / 2, lout / 2);
    // Nearly straight: no visible corner to round.
    const cross = Math.abs((cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x));
    if (r < 0.5 || cross / (lin * lout) < 0.02) {
      d += ` L${f1(cur.x)} ${f1(cur.y)}`;
      continue;
    }
    const a = { x: cur.x - ((cur.x - prev.x) / lin) * r, y: cur.y - ((cur.y - prev.y) / lin) * r };
    const b = { x: cur.x + ((next.x - cur.x) / lout) * r, y: cur.y + ((next.y - cur.y) / lout) * r };
    d += ` L${f1(a.x)} ${f1(a.y)} Q${f1(cur.x)} ${f1(cur.y)} ${f1(b.x)} ${f1(b.y)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d} L${f1(last.x)} ${f1(last.y)}`;
}

/** Polyline shifted sideways by `d` pixels (left of travel for positive d), mitred at joints. */
export function offsetPolyline(points: readonly Pt[], d: number): Pt[] {
  const p = dedupePoints(points);
  if (p.length < 2) return p;
  const normals = p.slice(1).map((b, i) => {
    const a = p[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (a.y - b.y) / len, y: (b.x - a.x) / len };
  });
  return p.map((pt, i) => {
    const n1 = normals[Math.max(0, i - 1)]!;
    const n2 = normals[Math.min(normals.length - 1, i)]!;
    let nx = n1.x + n2.x;
    let ny = n1.y + n2.y;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    // Mitre: keep the offset distance constant along both segments (capped for sharp turns).
    const cos = Math.max(0.5, nx * n2.x + ny * n2.y);
    return { x: pt.x + (nx * d) / cos, y: pt.y + (ny * d) / cos };
  });
}

/** Polyline length in pixels. */
export const polylineLength = (pts: readonly Pt[]): number => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1]!, p) : 0), 0);

/** Point and direction at a fraction of a polyline's length. */
export function pointAlong(pts: readonly Pt[], fraction: number): { p: Pt; angleDeg: number } | null {
  if (pts.length < 2) return null;
  const total = polylineLength(pts);
  let target = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = dist(a, b);
    if (target <= l || i === pts.length - 1) {
      const k = l === 0 ? 0 : Math.min(1, target / l);
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    }
    target -= l;
  }
  return null;
}

/** Distance along a polyline of the point on it closest to `p`. */
export function projectOnto(pts: readonly Pt[], p: Pt): number {
  let best = Infinity;
  let bestS = 0;
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = dist(a, b);
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const d = dist(p, q);
    if (d < best) {
      best = d;
      bestS = run + t * len;
    }
    run += len;
  }
  return bestS;
}

/**
 * Moves a marker along its line until it clears `avoid` points by `clearance` pixels (e.g. the
 * Not viable cross sliding off the incident marker that sits on the same segment). Returns the
 * original point when it is already clear or no clear spot exists within `maxSlide`.
 */
export function slideClear(pts: readonly Pt[], p: Pt, avoid: readonly Pt[], clearance: number, maxSlide = 140): Pt {
  const clear = (q: Pt) => avoid.every((a) => dist(a, q) >= clearance);
  if (clear(p) || pts.length < 2) return p;
  const total = polylineLength(pts);
  const s0 = projectOnto(pts, p);
  for (let d = 8; d <= maxSlide; d += 8) {
    for (const s of [s0 + d, s0 - d]) {
      if (s < 0 || s > total) continue;
      const q = pointAlong(pts, s / total)?.p;
      if (q && clear(q)) return q;
    }
  }
  return p;
}

/** Keeps text upright: angles folded into [-90, 90), so vertical text reads bottom to top. */
export function uprightAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a >= 180) a -= 360;
  if (a >= 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

/* ---------- Render-only simplification (never used for routing) ---------- */

const M_PER_DEG = 111_320;

/**
 * Douglas-Peucker on lng/lat with a tolerance in metres. Display only: it removes the small
 * wiggles of schematic lanes so the map reads as cartography. End points are always kept.
 */
export function simplifyLngLat(coords: readonly LngLatTuple[], toleranceM: number): LngLatTuple[] {
  if (coords.length <= 2 || toleranceM <= 0) return [...coords];
  const lat0 = (coords[0]![1] * Math.PI) / 180;
  const kx = Math.cos(lat0) * M_PER_DEG;
  const xy = coords.map(([lng, lat]) => ({ x: lng * kx, y: lat * M_PER_DEG }));
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = xy[a]!;
    const B = xy[b]!;
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const P = xy[i]!;
      const d = len === 0 ? Math.hypot(P.x - A.x, P.y - A.y) : Math.abs((B.x - A.x) * (A.y - P.y) - (A.x - P.x) * (B.y - A.y)) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && bestD > toleranceM) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/**
 * Display geometry per graph edge id. Twins share one simplified line (reversed), so a route
 * drawn over a road follows exactly the same pixels in either direction.
 */
export function renderGeometryIndex(file: Pick<GraphFile, 'edges'>, toleranceM: number | ((highway: string) => number)): Map<string, LngLatTuple[]> {
  const out = new Map<string, LngLatTuple[]>();
  for (const e of file.edges) {
    if (out.has(e.id)) continue;
    const g = simplifyLngLat(e.geometry, typeof toleranceM === 'number' ? toleranceM : toleranceM(e.highway));
    out.set(e.id, g);
    if (e.reverseId) out.set(e.reverseId, [...g].reverse());
  }
  return out;
}

/** Concatenated display geometry for a list of edge ids (shared joints dropped). */
export function edgesGeometry(edgeIds: readonly string[], index: ReadonlyMap<string, readonly LngLatTuple[]>): LngLatTuple[] | null {
  const out: LngLatTuple[] = [];
  for (const id of edgeIds) {
    const g = index.get(id);
    if (!g) return null;
    for (const p of g) {
      const last = out[out.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      out.push(p);
    }
  }
  return out;
}

export type RoadClass = 'trunk' | 'primary' | 'secondary' | 'minor' | 'path';

export const roadClass = (highway: string): RoadClass =>
  ['motorway', 'trunk'].includes(highway)
    ? 'trunk'
    : highway === 'primary'
      ? 'primary'
      : highway === 'secondary'
        ? 'secondary'
        : ['footway', 'path', 'steps', 'pedestrian', 'cycleway'].includes(highway)
          ? 'path'
          : 'minor';

export interface RoadChain {
  key: string;
  name: string | null;
  cls: RoadClass;
  bridge: boolean;
  tunnel: boolean;
  floodProne: boolean;
  coords: LngLatTuple[];
  edgeIds: string[];
}

/**
 * Joins graph edges into continuous chains (same name, class and structure; twins drawn once),
 * so corners between consecutive edges can be smoothed and a road gets one label, not one per edge.
 */
export function roadChains(file: Pick<GraphFile, 'edges'>, geometry?: ReadonlyMap<string, readonly LngLatTuple[]>): RoadChain[] {
  const seen = new Set<string>();
  type E = { id: string; from: string; to: string; coords: LngLatTuple[] };
  const groups = new Map<string, { meta: Omit<RoadChain, 'coords' | 'edgeIds' | 'key'>; edges: E[] }>();
  for (const e of file.edges) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.reverseId) seen.add(e.reverseId);
    const cls = roadClass(e.highway);
    const key = `${e.name ?? `~${e.wayId}`}|${cls}|${e.bridge ? 'b' : ''}${e.tunnel ? 't' : ''}|${e.floodProne ? 'f' : ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { meta: { name: e.name ?? null, cls, bridge: e.bridge, tunnel: e.tunnel, floodProne: e.floodProne }, edges: [] };
      groups.set(key, g);
    }
    g.edges.push({ id: e.id, from: e.from, to: e.to, coords: [...(geometry?.get(e.id) ?? e.geometry)] });
  }

  const out: RoadChain[] = [];
  for (const [key, g] of groups) {
    const byNode = new Map<string, number[]>();
    g.edges.forEach((e, i) => {
      for (const n of [e.from, e.to]) byNode.set(n, [...(byNode.get(n) ?? []), i]);
    });
    const used = new Set<number>();
    const walk = (start: string) => {
      let node = start;
      const coords: LngLatTuple[] = [];
      const ids: string[] = [];
      for (;;) {
        const next = (byNode.get(node) ?? []).find((i) => !used.has(i));
        if (next === undefined) break;
        used.add(next);
        const e = g.edges[next]!;
        const forward = e.from === node;
        const c = forward ? e.coords : [...e.coords].reverse();
        coords.push(...(coords.length ? c.slice(1) : c));
        ids.push(e.id);
        node = forward ? e.to : e.from;
      }
      if (ids.length) out.push({ key: `${key}#${out.length}`, ...g.meta, coords, edgeIds: ids });
    };
    // Start at chain ends (degree other than 2), then pick up any loops.
    for (const [n, list] of byNode) if (list.length !== 2) while (list.some((i) => !used.has(i))) walk(n);
    for (const [n, list] of byNode) while (list.some((i) => !used.has(i))) walk(n);
  }
  return out;
}

/* ---------- Label placement ---------- */

/** Oriented box: centre, size and rotation in degrees. */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angleDeg: number;
}

function corners(b: Box): Pt[] {
  const a = (b.angleDeg * Math.PI) / 180;
  const ux = { x: Math.cos(a), y: Math.sin(a) };
  const uy = { x: -Math.sin(a), y: Math.cos(a) };
  const hw = b.w / 2;
  const hh = b.h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([sx, sy]) => ({ x: b.cx + ux.x * sx! + uy.x * sy!, y: b.cy + ux.y * sx! + uy.y * sy! }));
}

/** Separating-axis test for two oriented rectangles. */
export function boxesOverlap(a: Box, b: Box): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const box of [a, b]) {
    const r = (box.angleDeg * Math.PI) / 180;
    for (const axis of [
      { x: Math.cos(r), y: Math.sin(r) },
      { x: -Math.sin(r), y: Math.cos(r) },
    ]) {
      const pa = ca.map((p) => p.x * axis.x + p.y * axis.y);
      const pb = cb.map((p) => p.x * axis.x + p.y * axis.y);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

export const boxInside = (b: Box, w: number, h: number, margin = 0): boolean =>
  corners(b).every((p) => p.x >= margin && p.y >= margin && p.x <= w - margin && p.y <= h - margin);

export interface LabelAnchor {
  x: number;
  y: number;
  angleDeg: number;
}

export interface LabelCandidate {
  id: string;
  text: string;
  /** Higher is placed first; lower-priority labels are dropped on collision. */
  priority: number;
  width: number;
  height: number;
  /** Tried in order; the first free one wins. */
  anchors: LabelAnchor[];
}

export interface PlacedLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  angleDeg: number;
  box: Box;
}

/**
 * Greedy label placement: highest priority first, first anchor that stays inside the view and
 * clears every obstacle and every label already placed. Ties keep the input order.
 */
export function placeLabels(candidates: readonly LabelCandidate[], obstacles: readonly Box[], view: { width: number; height: number }, gap = 4): PlacedLabel[] {
  const order = candidates.map((c, i) => ({ c, i })).sort((a, b) => b.c.priority - a.c.priority || a.i - b.i);
  const placed: PlacedLabel[] = [];
  for (const { c } of order) {
    for (const a of c.anchors) {
      const box: Box = { cx: a.x, cy: a.y, w: c.width + gap * 2, h: c.height + gap, angleDeg: a.angleDeg };
      if (!boxInside(box, view.width, view.height)) continue;
      if (obstacles.some((o) => boxesOverlap(box, o))) continue;
      if (placed.some((p) => boxesOverlap(box, p.box))) continue;
      placed.push({ id: c.id, text: c.text, x: a.x, y: a.y, angleDeg: a.angleDeg, box });
      break;
    }
  }
  return placed;
}

/** Width of a mono label: every glyph has the same advance. */
export const monoTextWidth = (text: string, fontSize: number, letterSpacingPx: number, advance = 0.6): number =>
  text.length * (fontSize * advance + letterSpacingPx);

/**
 * Anchors along a chain: midpoints of segments long enough to hold the label straight, most
 * central first, rotated to follow the road and kept upright.
 */
/** Drops interior points where the line turns less than `maxTurnDeg`, so runs read as one segment. */
export function mergeCollinear(pts: readonly Pt[], maxTurnDeg = 8): Pt[] {
  const p = dedupePoints(pts);
  if (p.length < 3) return p;
  const out: Pt[] = [p[0]!];
  for (let i = 1; i < p.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = p[i]!;
    const c = p[i + 1]!;
    const t1 = Math.atan2(b.y - a.y, b.x - a.x);
    const t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = Math.abs(((t2 - t1) * 180) / Math.PI) % 360;
    if (turn > 180) turn = 360 - turn;
    if (turn >= maxTurnDeg) out.push(b);
  }
  out.push(p[p.length - 1]!);
  return out;
}

export function chainAnchors(pts: readonly Pt[], labelWidth: number): LabelAnchor[] {
  const p = mergeCollinear(pts);
  if (p.length < 2) return [];
  const total = polylineLength(p);
  const segs: { a: Pt; b: Pt; len: number; mid: number }[] = [];
  let run = 0;
  for (let i = 1; i < p.length; i++) {
    const len = dist(p[i - 1]!, p[i]!);
    segs.push({ a: p[i - 1]!, b: p[i]!, len, mid: (run + len / 2) / Math.max(1, total) });
    run += len;
  }
  const out: LabelAnchor[] = [];
  for (const s of segs.filter((s) => s.len >= labelWidth + 12).sort((x, y) => Math.abs(x.mid - 0.5) - Math.abs(y.mid - 0.5))) {
    const angleDeg = uprightAngle((Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180) / Math.PI);
    // Centre, then slide along long segments.
    for (const k of s.len > labelWidth * 2.2 ? [0.5, 0.3, 0.7] : [0.5]) {
      out.push({ x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k, angleDeg });
    }
  }
  return out;
}

/** Horizontal callout anchors around a point: right, left, above, below. */
export function calloutAnchors(p: Pt, width: number, height: number, offset = 18): LabelAnchor[] {
  const out: LabelAnchor[] = [];
  for (const o of [offset, offset * 2, offset * 3]) {
    out.push(
      { x: p.x + o + width / 2, y: p.y, angleDeg: 0 },
      { x: p.x - o - width / 2, y: p.y, angleDeg: 0 },
      { x: p.x, y: p.y - o - height / 2, angleDeg: 0 },
      { x: p.x, y: p.y + o + height / 2, angleDeg: 0 },
      { x: p.x + o + width / 2, y: p.y - o, angleDeg: 0 },
      { x: p.x - o - width / 2, y: p.y - o, angleDeg: 0 },
      { x: p.x + o + width / 2, y: p.y + o, angleDeg: 0 },
      { x: p.x - o - width / 2, y: p.y + o, angleDeg: 0 },
    );
  }
  return out;
}

/** Axis-aligned obstacle box from a rectangle. */
export const rectBox = (x: number, y: number, w: number, h: number): Box => ({ cx: x + w / 2, cy: y + h / 2, w, h, angleDeg: 0 });
