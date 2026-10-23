import { bearingDeg, haversineM } from '@vighnaway/engine';
import type { LatLng } from '@vighnaway/contracts';

/**
 * Turn-by-turn guidance, derived only from geometry: a polyline of road points, where it crosses a
 * junction and what the road is called. No routing happens here; the route is already chosen.
 */

/** One vertex of the path. `name` is the road that starts at this vertex (inherited when omitted). */
export interface GuidePoint extends LatLng {
  /** A graph node or a way boundary: turns are only announced at junctions, or when they are sharp. */
  junction?: boolean;
  name?: string | null;
}

export type TurnKind = 'depart' | 'slight_left' | 'left' | 'sharp_left' | 'slight_right' | 'right' | 'sharp_right' | 'uturn' | 'arrive';

export interface Maneuver {
  kind: TurnKind;
  /** The road the traveller turns onto (or starts on, or arrives at); null when it has no name. */
  name: string | null;
  /** Distance from the start of the path to the corner. */
  atM: number;
  point: LatLng;
}

export interface GuidePath {
  points: LatLng[];
  /** Metres from the start to each point. */
  cumM: number[];
  totalM: number;
  maneuvers: Maneuver[];
  /** Compass bearing of the first segment, for "Head north". */
  startBearing: number;
}

/** Turns smaller than this are "straight on"; larger ones are announced at a junction. */
export const TURN_MIN_DEG = 30;
/** Away from a junction only a really sharp bend is announced. */
export const BEND_MIN_DEG = 70;
/** The bearing is measured this far before and after a corner, so a wobbly line does not make a turn. */
const WINDOW_M = 25;
/** Corners closer than this along the path are one manoeuvre. */
const MERGE_M = 30;
/** Further off the path than this the traveller is off route. */
export const OFF_ROUTE_M = 45;

const KX = (lat: number) => Math.cos((lat * Math.PI) / 180) * 111320;
const KY = 110574;

/** Signed difference of two bearings in (-180, 180]; positive is a turn to the right. */
export function turnAngle(inDeg: number, outDeg: number): number {
  let d = (outDeg - inDeg + 540) % 360;
  d -= 180;
  return d === -180 ? 180 : d;
}

export function classifyTurn(angle: number): TurnKind | null {
  const a = Math.abs(angle);
  if (a < TURN_MIN_DEG) return null;
  const right = angle > 0;
  if (a < 60) return right ? 'slight_right' : 'slight_left';
  if (a < 125) return right ? 'right' : 'left';
  if (a < 165) return right ? 'sharp_right' : 'sharp_left';
  return 'uturn';
}

/** Index of the last cumulative distance that is <= d (binary search). */
function indexAt(cumM: number[], d: number): number {
  let lo = 0;
  let hi = cumM.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumM[mid]! <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The point `d` metres along the path (clamped). */
export function pointAtM(path: Pick<GuidePath, 'points' | 'cumM' | 'totalM'>, d: number): LatLng {
  const { points, cumM } = path;
  if (d <= 0) return points[0]!;
  if (d >= path.totalM) return points[points.length - 1]!;
  const i = indexAt(cumM, d);
  const a = points[i]!;
  const b = points[i + 1] ?? a;
  const span = cumM[i + 1]! - cumM[i]!;
  const t = span > 0 ? (d - cumM[i]!) / span : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Builds the path and its manoeuvres from road points in travel order. */
export function buildGuidePath(input: readonly GuidePoint[]): GuidePath {
  const pts: GuidePoint[] = [];
  let name: string | null = null;
  for (const p of input) {
    if (p.name !== undefined) name = p.name;
    const last = pts[pts.length - 1];
    if (last && haversineM(last, p) < 0.5) {
      // The same place twice (the end of one road, the start of the next): keep one, remember the junction.
      if (p.junction) last.junction = true;
      if (p.name !== undefined) last.name = p.name;
      continue;
    }
    pts.push({ lat: p.lat, lng: p.lng, junction: p.junction, name });
  }
  const cumM: number[] = [0];
  for (let i = 1; i < pts.length; i++) cumM.push(cumM[i - 1]! + haversineM(pts[i - 1]!, pts[i]!));
  const totalM = cumM[cumM.length - 1] ?? 0;
  const path: GuidePath = { points: pts.map((p) => ({ lat: p.lat, lng: p.lng })), cumM, totalM, maneuvers: [], startBearing: 0 };
  if (pts.length < 2) return path;
  path.startBearing = bearingDeg(pts[0]!, pts[1]!);

  const found: { kind: TurnKind; atM: number; weight: number; i: number }[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const at = cumM[i]!;
    const before = pointAtM(path, Math.max(0, at - WINDOW_M));
    const after = pointAtM(path, Math.min(totalM, at + WINDOW_M));
    if (haversineM(before, pts[i]!) < 3 || haversineM(pts[i]!, after) < 3) continue;
    const angle = turnAngle(bearingDeg(before, pts[i]!), bearingDeg(pts[i]!, after));
    const kind = classifyTurn(angle);
    if (!kind) continue;
    if (!pts[i]!.junction && Math.abs(angle) < BEND_MIN_DEG) continue;
    found.push({ kind, atM: at, weight: Math.abs(angle), i });
  }
  // A curve gives several neighbouring corners: keep the sharpest of each cluster.
  const kept: typeof found = [];
  for (const f of found) {
    const last = kept[kept.length - 1];
    if (last && f.atM - last.atM < MERGE_M) {
      if (f.weight > last.weight) kept[kept.length - 1] = f;
    } else kept.push(f);
  }
  path.maneuvers.push({ kind: 'depart', name: pts[0]!.name ?? null, atM: 0, point: pts[0]! });
  for (const k of kept) {
    path.maneuvers.push({ kind: k.kind, name: pts[k.i]!.name ?? null, atM: k.atM, point: pts[k.i]! });
  }
  path.maneuvers.push({ kind: 'arrive', name: null, atM: totalM, point: pts[pts.length - 1]! });
  return path;
}

export interface GuideProgress {
  /** Metres travelled along the path (the traveller's position projected onto it). */
  alongM: number;
  /** How far the traveller is from the path. */
  offM: number;
  offRoute: boolean;
  remainingM: number;
  /** The next manoeuvre ahead and how far it is; the arrival at the end. */
  next: Maneuver;
  nextDistM: number;
  /** The one after it, so "then turn left" can be said. */
  then: Maneuver | null;
}

/** Projects `p` onto segment ab (local metric frame): t in [0, 1] and the distance in metres. */
function project(p: LatLng, a: LatLng, b: LatLng): { t: number; distM: number } {
  const kx = KX((a.lat + b.lat) / 2);
  const ax = a.lng * kx;
  const ay = a.lat * KY;
  const dx = b.lng * kx - ax;
  const dy = b.lat * KY - ay;
  const px = p.lng * kx - ax;
  const py = p.lat * KY - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
  return { t, distM: Math.hypot(px - t * dx, py - t * dy) };
}

/**
 * Where the traveller is on the path. `hintM` (the last known distance along) keeps progress moving
 * forward and cheap: the search starts in a window around it and only widens when nothing there fits.
 */
export function progressOn(path: GuidePath, p: LatLng, hintM = 0): GuideProgress | null {
  const n = path.points.length;
  if (n < 2) return null;
  const scan = (fromM: number, toM: number) => {
    let best: { alongM: number; offM: number } | null = null;
    const start = indexAt(path.cumM, Math.max(0, fromM));
    for (let i = start; i < n - 1; i++) {
      if (path.cumM[i]! > toM) break;
      const { t, distM } = project(p, path.points[i]!, path.points[i + 1]!);
      if (!best || distM < best.offM) best = { alongM: path.cumM[i]! + t * (path.cumM[i + 1]! - path.cumM[i]!), offM: distM };
    }
    return best;
  };
  let best = scan(hintM - 60, hintM + 400);
  if (!best || best.offM > OFF_ROUTE_M) {
    const wide = scan(0, path.totalM);
    if (wide && (!best || wide.offM < best.offM)) best = wide;
  }
  if (!best) return null;
  const next = path.maneuvers.find((m) => m.kind !== 'depart' && m.atM > best!.alongM + 4) ?? path.maneuvers[path.maneuvers.length - 1]!;
  const after = path.maneuvers.find((m) => m.kind !== 'depart' && m.atM > next.atM + 1) ?? null;
  return {
    alongM: best.alongM,
    offM: best.offM,
    offRoute: best.offM > OFF_ROUTE_M,
    remainingM: Math.max(0, path.totalM - best.alongM),
    next,
    nextDistM: Math.max(0, next.atM - best.alongM),
    then: after && after.kind !== 'arrive' && after.atM - next.atM < 150 ? after : null,
  };
}

/** The first manoeuvre: "Head north on X" before the traveller has moved. */
export function departBearingName(bearing: number): 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest' {
  const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'] as const;
  return names[Math.round(bearing / 45) % 8]!;
}
