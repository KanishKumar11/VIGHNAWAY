import { useEffect, useMemo, useRef, useState } from 'react';
import { isOpenStatus, type Incident, type LatLng, type Place, type PlanResult, type RouteEvaluation, type RouteRole } from '@vighnaway/contracts';
import { routeFlow, vehiclePosition, type EvalContext, type Graph, type IncidentIndex, type VehicleState } from '@vighnaway/engine';
import { incidentA11y } from '@/i18n/engineText';
import { fmtAge } from '@/i18n/format';
import { edgeMidpoint, floodProneSegments, routeCoords, travelledCoords, type MapCoord } from '@/lib/engine';
import { dur } from '@/lib/motion';
import type { Transition } from '@/stores/trip';
import { motion, routeStyles, zIndex, type RouteStyleKey } from '@/theme';

/** Everything the map draws, derived from the stores; shared by the Google map and the schematic. */
export interface MapLine {
  key: string;
  coords: MapCoord[];
  style: RouteStyleKey;
  /** Overrides for the route-change moment. */
  color?: string;
  width?: number;
  opacity?: number;
  zIndex: number;
  casing: boolean;
  /**
   * Drawn fraction from the origin (launch reveal, route-change reveal). The Google layer slices
   * coordinates by it (polylines cannot animate their stroke); the schematic animates its stroke.
   */
  reveal: number;
  /**
   * Static speed encoding (DESIGN_VISION Appendix A): the line split into runs that are drawn,
   * with blocked edges left out (an interruption), plus the runs on congested edges, which get a
   * distinct static treatment. Absent for lines without a route (underlay, flash).
   */
  flow?: { runs: MapCoord[][]; slow: MapCoord[][] };
}

export interface MapPin {
  key: string;
  kind: 'origin' | 'destination' | 'blocking' | 'vehicle';
  /** Destination pin: a hospital gets the hospital glyph, any other place a plain pin. */
  hospital?: boolean;
  coordinate: MapCoord;
  headingDeg?: number;
}

export interface MapIncident {
  incident: Incident;
  coordinate: MapCoord;
  ageLabel: string;
  /** Spoken label: hazard, status, source and age (DESIGN_VISION 5.4). */
  a11y: string;
}

const toCoord = (p: LatLng): MapCoord => ({ latitude: p.lat, longitude: p.lng });

const roleZ: Record<RouteRole, number> = {
  alternative: zIndex.alternative,
  usual_fastest: zIndex.usual_fastest,
  blocked: zIndex.blocked,
  recommended: zIndex.recommended,
};

/**
 * Most incident markers the map draws. A live feed can carry hundreds; each is a native bitmap, and
 * drawing them all stalls the phone. Routing still uses every incident; only the drawing is capped.
 */
export const MAP_MARKERS_MAX = 40;
/** How far (degrees, ~500 m) around the routes an off-route incident still earns a marker. */
const CORRIDOR_PAD_DEG = 0.005;
const STATUS_RANK: Record<string, number> = { verified: 0, corroborated: 1, unverified: 2, resolved: 3 };

/**
 * The incidents worth a marker: every one the engine tied to a shown route (hazard or block) first,
 * then open ones in the corridor around the routes, verified first and newest first, up to
 * MAP_MARKERS_MAX.
 */
export function mapIncidents(graph: Graph, incidents: Incident[], routes: RouteEvaluation[], origin: Place | null, destination: Place | null): Incident[] {
  const visible = incidents.filter((i) => isOpenStatus(i.status) || i.status === 'resolved');
  if (visible.length <= MAP_MARKERS_MAX) return visible;
  const onRoute = new Set<string>();
  for (const r of routes) {
    for (const h of r.hazards) if (h.effect !== 'none') onRoute.add(h.incidentId);
    for (const b of r.blockedBy) onRoute.add(b.incidentId);
  }
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  const grow = (lat: number, lng: number) => {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  };
  for (const r of routes) for (const c of routeCoords(graph, r.edgeIds, r.routeId)) grow(c.latitude, c.longitude);
  for (const p of [origin, destination]) if (p) grow(p.point.lat, p.point.lng);
  const inCorridor = (i: Incident) =>
    i.point.lat >= south - CORRIDOR_PAD_DEG && i.point.lat <= north + CORRIDOR_PAD_DEG && i.point.lng >= west - CORRIDOR_PAD_DEG && i.point.lng <= east + CORRIDOR_PAD_DEG;
  const first = visible.filter((i) => onRoute.has(i.id));
  const rest = visible
    .filter((i) => !onRoute.has(i.id) && isOpenStatus(i.status) && inCorridor(i))
    .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.lastReportAtS - a.lastReportAtS || (a.id < b.id ? -1 : 1));
  return [...first, ...rest].slice(0, Math.max(MAP_MARKERS_MAX, first.length));
}

/** Progressive coordinate reveal (polylines cannot animate their stroke). */
export function sliceCoords(coords: MapCoord[], progress: number): MapCoord[] {
  if (progress >= 1) return coords;
  const n = Math.max(2, Math.ceil(coords.length * progress));
  return coords.slice(0, n);
}

/** Launch reveal: routes grow from the origin over ~600 ms, once per plan context. */
export function useLaunchReveal(key: string | null): number {
  const [progress, setProgress] = useState(1);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!key || seen.current === key) return;
    seen.current = key;
    const total = dur(motion.launchReveal);
    if (total === 0) return;
    const steps = 8;
    setProgress(0.05);
    const ids = Array.from({ length: steps }, (_, i) => setTimeout(() => setProgress((i + 1) / steps), (total * (i + 1)) / steps));
    return () => ids.forEach(clearTimeout);
  }, [key]);
  return progress;
}

export function useMapModel(args: {
  graph: Graph;
  plan: PlanResult | null;
  vehicle: VehicleState | null;
  transition: Transition | null;
  incidents: Incident[];
  origin: Place | null;
  destination: Place | null;
  nowS: number;
  revealProgress: number;
  /** Alert context and incident index for the speed encoding; omitted in tests that do not need it. */
  ctx?: EvalContext;
  index?: IncidentIndex;
}) {
  const { graph, plan, vehicle, transition, incidents, origin, destination, nowS, revealProgress, ctx, index } = args;

  const underlay = useMemo(() => floodProneSegments(graph), [graph]);

  const routes = plan?.routes;
  const lines = useMemo(() => {
    const out: MapLine[] = underlay.map((s) => ({
      key: `fp-${s.id}`,
      coords: s.coords,
      style: 'floodProne' as const,
      zIndex: zIndex.floodProne,
      casing: false,
      reveal: 1,
    }));
    const revealing = transition && transition.phase !== 'done' ? transition : null;
    if (revealing?.fromRoute && !routes?.some((r) => r.routeId === revealing.fromRoute!.routeId && r.role === 'blocked')) {
      // Old route dims to slate and thins while the new one fades in.
      out.push({
        key: `old-${revealing.fromRoute.routeId}`,
        flow: ctx && index ? flowRuns(graph, revealing.fromRoute.edgeIds, index, ctx) : undefined,
        coords: routeCoords(graph, revealing.fromRoute.edgeIds, revealing.fromRoute.routeId),
        style: 'alternative',
        width: routeStyles.alternative.width,
        opacity: 0.6,
        zIndex: zIndex.alternative,
        casing: false,
        reveal: 1,
      });
    }
    for (const r of routes ?? []) {
      const coords = routeCoords(graph, r.edgeIds, r.routeId);
      let reveal = revealProgress;
      if (r.role === 'recommended') {
        reveal = revealing && revealing.toRouteId === r.routeId ? (revealing.phase === 'flash' ? 0 : revealing.progress) : revealProgress;
        if (reveal <= 0) continue;
      }
      const flow = ctx && index ? flowRuns(graph, r.edgeIds, index, ctx) : undefined;
      out.push({ key: `route-${r.role}-${r.routeId}`, coords, style: r.role, zIndex: roleZ[r.role], casing: r.role === 'recommended', reveal, flow });
    }
    if (revealing?.blockedEdgeId && revealing.phase === 'flash') {
      const flashOn = Math.round(revealing.progress * 4) % 2 === 0;
      if (flashOn) {
        out.push({
          key: `flash-${revealing.id}`,
          coords: routeCoords(graph, [revealing.blockedEdgeId]),
          style: 'blocked',
          width: routeStyles.recommended.casingWidth,
          zIndex: zIndex.blockingMarker,
          casing: false,
          reveal: 1,
        });
      }
    }
    return out;
  }, [graph, underlay, routes, transition, revealProgress, ctx, index]);

  const travelled = useMemo<MapLine | null>(() => {
    if (!vehicle || (vehicle.index === 0 && vehicle.fraction === 0)) return null;
    return { key: 'travelled', coords: travelledCoords(graph, vehicle), style: 'travelled', zIndex: zIndex.travelled, casing: true, reveal: 1 };
  }, [graph, vehicle]);

  const pins = useMemo(() => {
    const out: MapPin[] = [];
    if (origin) out.push({ key: 'origin', kind: 'origin', coordinate: toCoord(origin.point) });
    if (destination) out.push({ key: 'destination', kind: 'destination', coordinate: toCoord(destination.point), hospital: destination.kind === 'hospital' });
    const seen = new Set<string>();
    for (const r of routes ?? []) {
      for (const b of r.blockedBy) {
        if (seen.has(b.edgeId)) continue;
        seen.add(b.edgeId);
        const mid = edgeMidpoint(graph, b.edgeId);
        if (mid) out.push({ key: `block-${b.edgeId}`, kind: 'blocking', coordinate: toCoord(mid) });
      }
    }
    return out;
  }, [graph, routes, origin, destination]);

  const vehiclePin = useMemo<MapPin | null>(() => {
    if (!vehicle) return null;
    const pos = vehiclePosition(graph, vehicle);
    return pos ? { key: 'vehicle', kind: 'vehicle', coordinate: toCoord(pos.point), headingDeg: pos.headingDeg } : null;
  }, [graph, vehicle]);

  // Age labels change once a minute; bucket nowS so markers do not re-render every tick.
  const minute = Math.floor(nowS / 60);
  const shown = useMemo(() => mapIncidents(graph, incidents, routes ?? [], origin, destination), [graph, incidents, routes, origin, destination]);
  const markers = useMemo<MapIncident[]>(
    () => shown.map((i) => ({ incident: i, coordinate: toCoord(i.point), ageLabel: fmtAge(Math.max(0, minute * 60 - i.lastReportAtS)), a11y: incidentA11y(i, minute * 60) })),
    [shown, minute],
  );

  return { lines, travelled, pins, vehiclePin, markers };
}

/**
 * Splits a route into drawn runs (blocked edges left out, so the line is visibly interrupted)
 * and congested runs (slowdown > 1), from the engine's per-edge flow.
 */
export function flowRuns(graph: Graph, edgeIds: readonly string[], index: IncidentIndex, ctx: EvalContext): { runs: MapCoord[][]; slow: MapCoord[][] } {
  const flow = routeFlow(graph, edgeIds, index, ctx);
  const runs: MapCoord[][] = [];
  const slow: MapCoord[][] = [];
  let run: MapCoord[] = [];
  let slowRun: MapCoord[] = [];
  const push = (arr: MapCoord[], pts: MapCoord[]) => {
    for (const p of pts) {
      const last = arr[arr.length - 1];
      if (!last || last.latitude !== p.latitude || last.longitude !== p.longitude) arr.push(p);
    }
  };
  flow.forEach((seg, i) => {
    const pts = routeCoords(graph, [edgeIds[i]!]);
    if (seg.blocked) {
      if (run.length > 1) runs.push(run);
      if (slowRun.length > 1) slow.push(slowRun);
      run = [];
      slowRun = [];
      return;
    }
    push(run, pts);
    if (seg.slowdown > 1) push(slowRun, pts);
    else if (slowRun.length) {
      if (slowRun.length > 1) slow.push(slowRun);
      slowRun = [];
    }
  });
  if (run.length > 1) runs.push(run);
  if (slowRun.length > 1) slow.push(slowRun);
  return { runs, slow };
}

export function routeById(plan: PlanResult | null, id: string | null | undefined): RouteEvaluation | null {
  return (id && plan?.routes.find((r) => r.routeId === id)) || null;
}
