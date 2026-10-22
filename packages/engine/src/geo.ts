import type { LatLng, LngLatTuple } from '@vighnaway/contracts';

const R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. Display and snapping only; routing uses stored lengths. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const tupleToLatLng = (t: LngLatTuple): LatLng => ({ lat: t[1], lng: t[0] });

/** Initial bearing from a to b in degrees, 0..360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Projects p onto segment ab in a local equirectangular frame. Returns t in [0,1] and distance. */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { t: number; distanceM: number } {
  const kx = Math.cos(toRad((a.lat + b.lat) / 2)) * 111320;
  const ky = 110574;
  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx - ax;
  const by = b.lat * ky - ay;
  const px = p.lng * kx - ax;
  const py = p.lat * ky - ay;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const dx = px - t * bx;
  const dy = py - t * by;
  return { t, distanceM: Math.sqrt(dx * dx + dy * dy) };
}

/** Cumulative lengths along a polyline (first entry 0). */
export function cumulativeLengths(geometry: readonly LngLatTuple[]): number[] {
  const out = [0];
  for (let i = 1; i < geometry.length; i++) {
    out.push(out[i - 1]! + haversineM(tupleToLatLng(geometry[i - 1]!), tupleToLatLng(geometry[i]!)));
  }
  return out;
}

/** Point and heading at `fraction` (0..1) of a polyline's length. */
export function pointAlong(
  geometry: readonly LngLatTuple[],
  cumulative: readonly number[],
  fraction: number,
): { point: LatLng; headingDeg: number } {
  const total = cumulative[cumulative.length - 1] ?? 0;
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i]! < target) i++;
  const a = tupleToLatLng(geometry[i - 1]!);
  const b = tupleToLatLng(geometry[i]!);
  const segLen = cumulative[i]! - cumulative[i - 1]!;
  const t = segLen > 0 ? (target - cumulative[i - 1]!) / segLen : 0;
  return {
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    headingDeg: bearingDeg(a, b),
  };
}
