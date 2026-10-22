import type { LatLng, LngLatTuple } from '@vighnaway/contracts';

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const insetsOf = (p: number | Insets): Insets => (typeof p === 'number' ? { top: p, right: p, bottom: p, left: p } : p);

export interface Projection {
  width: number;
  height: number;
  /** Ground metres per screen pixel. */
  metresPerPx: number;
  toXY(p: LatLng): { x: number; y: number };
  tupleToXY(t: LngLatTuple): { x: number; y: number };
  toLatLng(x: number, y: number): LatLng;
}

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQ = 111_320;

/**
 * Equirectangular projection that fits `bbox` into a width x height panel inside `padding`
 * (a number, or per-side insets so floating rails never cover the fitted area), preserving
 * aspect ratio. Content outside the bbox still projects, so roads run on under the rails.
 * Schematic view only; the Google map does its own projection.
 */
export function makeProjection(bbox: Bbox, width: number, height: number, padding: number | Insets = 32): Projection {
  const pad = insetsOf(padding);
  const midLat = ((bbox.north + bbox.south) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat) * M_PER_DEG_LNG_EQ;
  const ky = M_PER_DEG_LAT;
  const worldW = Math.max(1, (bbox.east - bbox.west) * kx);
  const worldH = Math.max(1, (bbox.north - bbox.south) * ky);
  const availW = Math.max(1, width - pad.left - pad.right);
  const availH = Math.max(1, height - pad.top - pad.bottom);
  const scale = Math.min(availW / worldW, availH / worldH);
  const offX = pad.left + (availW - worldW * scale) / 2;
  const offY = pad.top + (availH - worldH * scale) / 2;
  const toXY = (p: LatLng) => ({
    x: offX + (p.lng - bbox.west) * kx * scale,
    y: offY + (bbox.north - p.lat) * ky * scale,
  });
  return {
    width,
    height,
    metresPerPx: 1 / scale,
    toXY,
    tupleToXY: (t) => toXY({ lng: t[0], lat: t[1] }),
    toLatLng: (x, y) => ({
      lng: bbox.west + (x - offX) / (kx * scale),
      lat: bbox.north - (y - offY) / (ky * scale),
    }),
  };
}

/** SVG points attribute for a polyline. */
export const svgPoints = (proj: Projection, coords: readonly LngLatTuple[]): string =>
  coords
    .map((c) => {
      const { x, y } = proj.tupleToXY(c);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

/** Bounding box of points, grown by `marginFrac` of its size on every side. */
export function boundsOf(points: readonly LatLng[], marginFrac = 0): Bbox | null {
  if (!points.length) return null;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  const dy = (north - south) * marginFrac;
  const dx = (east - west) * marginFrac;
  return { south: south - dy, west: west - dx, north: north + dy, east: east + dx };
}

/** Linear blend between two boxes (camera tween). */
export const lerpBbox = (a: Bbox, b: Bbox, k: number): Bbox => ({
  south: a.south + (b.south - a.south) * k,
  west: a.west + (b.west - a.west) * k,
  north: a.north + (b.north - a.north) * k,
  east: a.east + (b.east - a.east) * k,
});
