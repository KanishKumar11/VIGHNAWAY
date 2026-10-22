import type { LatLng, LngLatTuple } from '@vighnaway/contracts';
import {
  calloutAnchors,
  chainAnchors,
  monoTextWidth,
  placeLabels,
  rectBox,
  type Box,
  type LabelCandidate,
  type PlacedLabel,
  type Pt,
  type RoadChain,
  type RoadClass,
} from './mapGeometry';
import type { Insets, Projection } from './projection';

/**
 * Which map labels to draw and where (schematic view): crossings first (they carry the story),
 * then the railway, then road names by class. Labels never cover a floating panel, a marker,
 * a place name or a drawn route; lower-priority labels are dropped instead. Pure.
 */
export const LABEL_PRIORITY: Record<RoadClass, number> = { trunk: 50, primary: 40, secondary: 30, minor: 20, path: 5 };
export const ROAD_WIDTH: Record<RoadClass, number> = { trunk: 12, primary: 8, secondary: 5, minor: 3, path: 1.5 };

export type LabelSide = 'center' | 'start' | 'end';

export interface MapLabelInput {
  proj: Projection;
  width: number;
  height: number;
  pad: Insets;
  chains: readonly RoadChain[];
  railway: readonly LngLatTuple[] | null;
  railwayText: string | null;
  font: { size: number; lineHeight: number; tracking: number };
  incidents: readonly LatLng[];
  /** Places with the side their name chip extends to, and its approximate width. */
  places: readonly { point: LatLng; side: LabelSide; labelWidth: number; above?: boolean }[];
  crosses: readonly LatLng[];
  vehicle: LatLng | null;
  routes: readonly { pts: readonly Pt[]; thickness: number }[];
}

const toPts = (proj: Projection, coords: readonly LngLatTuple[]): Pt[] => coords.map((c) => proj.tupleToXY(c));

/** Thin boxes along a polyline, so labels never sit on top of a drawn route. */
export function lineObstacles(pts: readonly Pt[], thickness: number, step = 28): Box[] {
  const out: Box[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.5) continue;
    const n = Math.max(1, Math.ceil(len / step));
    const angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      out.push({ cx: a.x + (b.x - a.x) * t, cy: a.y + (b.y - a.y) * t, w: len / n + 2, h: thickness, angleDeg });
    }
  }
  return out;
}

/** Where a place's name chip goes so it stays inside the visible map. */
export function labelSide(x: number, width: number, pad: Insets, labelWidth: number): LabelSide {
  if (x - labelWidth / 2 < pad.left - 8) return 'start';
  if (x + labelWidth / 2 > width - pad.right + 8) return 'end';
  return 'center';
}

export function mapObstacles(input: MapLabelInput): Box[] {
  const { proj, width, height, pad } = input;
  const m = 12;
  const out: Box[] = [
    rectBox(0, 0, width, pad.top - m),
    rectBox(0, 0, pad.left - m, height),
    rectBox(width - pad.right + m, 0, pad.right, height),
    rectBox(0, height - pad.bottom + m, width, pad.bottom),
  ];
  for (const p0 of input.incidents) {
    const p = proj.toXY(p0);
    // Disc plus the age pill under it ("Just now" is wider than the disc).
    out.push(rectBox(p.x - 24, p.y - 24, 48, 44), rectBox(p.x - 50, p.y + 18, 100, 26));
  }
  for (const pl of input.places) {
    const p = proj.toXY(pl.point);
    const w = pl.labelWidth;
    const x0 = pl.side === 'start' ? p.x - 12 : pl.side === 'end' ? p.x - w + 12 : p.x - w / 2;
    out.push(rectBox(p.x - 22, p.y - 52, 44, 52), rectBox(x0 - 6, pl.above ? p.y - 84 : p.y + 2, w + 12, 30));
  }
  for (const c of input.crosses) {
    const p = proj.toXY(c);
    out.push(rectBox(p.x - 16, p.y - 16, 130, 32));
  }
  if (input.vehicle) {
    const p = proj.toXY(input.vehicle);
    out.push(rectBox(p.x - 20, p.y - 20, 40, 40));
  }
  for (const r of input.routes) out.push(...lineObstacles(r.pts, r.thickness));
  if (input.railway) out.push(...lineObstacles(toPts(proj, input.railway), 12));
  return out;
}

export function mapLabelCandidates(input: MapLabelInput): LabelCandidate[] {
  const { proj, font } = input;
  const h = font.lineHeight;
  const w = (t: string) => monoTextWidth(t, font.size, font.tracking);
  const cands: LabelCandidate[] = [];
  const byName = new Map<string, RoadChain[]>();
  for (const c of input.chains) if (c.name) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);

  for (const [name, list] of byName) {
    const crossing = list.some((c) => c.bridge || c.tunnel);
    if (crossing) {
      const c = list.find((x) => x.bridge || x.tunnel)!;
      const pts = toPts(proj, c.coords);
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cands.push({ id: `x:${name}`, text: name, priority: 90, width: w(name), height: h, anchors: calloutAnchors(center, w(name), h, 16) });
      continue;
    }
    const cls = list.reduce<RoadClass>((best, c) => (LABEL_PRIORITY[c.cls] > LABEL_PRIORITY[best] ? c.cls : best), list[0]!.cls);
    if (cls === 'path') continue;
    const tw = w(name);
    const off = ROAD_WIDTH[cls] / 2 + h / 2 + 2;
    const anchors = list
      .map((c) => toPts(proj, c.coords))
      .sort((a, b) => b.length - a.length)
      .flatMap((pts) => {
        const on = chainAnchors(pts, tw);
        const shift = (s: number) =>
          on.map((a) => ({ ...a, x: a.x - Math.sin((a.angleDeg * Math.PI) / 180) * off * s, y: a.y + Math.cos((a.angleDeg * Math.PI) / 180) * off * s }));
        return [...on, ...shift(-1), ...shift(1), ...shift(-1.8), ...shift(1.8)];
      });
    if (anchors.length) cands.push({ id: `r:${name}`, text: name, priority: LABEL_PRIORITY[cls], width: tw, height: h, anchors });
  }

  if (input.railway && input.railwayText) {
    const [a, b] = toPts(proj, input.railway);
    const angle = (Math.atan2(b!.y - a!.y, b!.x - a!.x) * 180) / Math.PI;
    const up = angle > 90 ? angle - 180 : angle <= -90 ? angle + 180 : angle;
    const text = input.railwayText;
    const anchors = [0.22, 0.3, 0.38, 0.62, 0.7, 0.78, 0.14, 0.86, 0.5].flatMap((k) => {
      const x = a!.x + (b!.x - a!.x) * k;
      const y = a!.y + (b!.y - a!.y) * k;
      const nx = -Math.sin((up * Math.PI) / 180) * 17;
      const ny = Math.cos((up * Math.PI) / 180) * 17;
      return [
        { x: x + nx, y: y + ny, angleDeg: up },
        { x: x - nx, y: y - ny, angleDeg: up },
        { x: x + nx * 2, y: y + ny * 2, angleDeg: up },
        { x: x - nx * 2, y: y - ny * 2, angleDeg: up },
      ];
    });
    cands.push({ id: 'rail', text, priority: 95, width: w(text), height: h, anchors });
  }
  return cands;
}

export function buildMapLabels(input: MapLabelInput): PlacedLabel[] {
  return placeLabels(mapLabelCandidates(input), mapObstacles(input), { width: input.width, height: input.height });
}
