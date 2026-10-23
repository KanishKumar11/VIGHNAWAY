import { useEffect, useMemo, useRef, useState } from 'react';
import { isOpenStatus, type Incident, type LatLng, type Place, type PlanResult, type RouteEvaluation, type RouteRole } from '@vighnaway/contracts';
import { haversineM, routeFlow, vehiclePosition, type EvalContext, type Graph, type IncidentIndex, type VehicleState } from '@vighnaway/engine';
import { incidentA11y } from '@/i18n/engineText';
import { fmtAge, fmtDuration } from '@/i18n/format';
import { edgeMidpoint, floodProneSegments, routeCoords, travelledCoords, type MapCoord } from '@/lib/engine';
import { dur } from '@/lib/motion';
import type { Transition } from '@/stores/trip';
import { motion, routeStyles, zIndex, type RouteStyleKey } from '@/theme';

/** Everything the map draws, derived from the stores; shared by the Google map and the schematic. */
export interface MapLine {
  key: string;
  /** Set on a route's own line (not on the underlay, the old route or the flash): tapping it chooses that route. */
  routeId?: string;
  coords: MapCoord[];
  style: RouteStyleKey;
  /** Overrides for the route-change moment. */
  color?: string;
  width?: number;
  opacity?: number;
  zIndex: number;
  /** A fixed dash pattern (the local road to the network), drawn as one plain line. */
  dash?: readonly number[];
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

/** A time bubble on a route: its total time on the chosen route, the difference on an alternative. Tap to choose it. */
export interface MapRouteLabel {
  key: string;
  routeId: string;
  coordinate: MapCoord;
  text: string;
  primary: boolean;
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

/** An alternative needs at least this much road of its own to earn a bubble; otherwise it is the same line as the main route. */
const OWN_ROAD_MIN_FRACTION = 0.08;
const OWN_ROAD_MIN_M = 400;
const MAX_ROUTE_LABELS = 4;
/** Where along the main route its bubble may sit (a share of its length), best first. */
const MAIN_BUBBLE_AT = [0.5, 0.3, 0.7, 0.15, 0.85];
const MIN_BUBBLE_GAP_M = 300;
const BUBBLE_GAP_FRACTION = 0.12;

const signed = (deltaS: number): string => `${deltaS >= 0 ? '+' : '−'}${fmtDuration(Math.max(60, Math.abs(deltaS)))}`;

/**
 * Time bubbles like Google Maps: the main route shows its total time, each alternative the time it
 * adds or saves, placed on the stretch where it leaves the main route. An alternative that is the
 * same line as the main one (almost all shared road) gets none; it is still in the list.
 */
export function routeLabelsFor(graph: Graph, routes: readonly RouteEvaluation[], primaryId: string | null): MapRouteLabel[] {
  const primary = routes.find((r) => r.routeId === primaryId);
  if (!primary) return [];
  const midOf = (id: string) => edgeMidpoint(graph, id);
  const shared = new Set(primary.edgeIds);
  // Alternatives first: their bubble sits where they leave the main route.
  const alts: MapRouteLabel[] = [];
  for (const r of routes) {
    if (r.routeId === primary.routeId || r.role === 'blocked' || alts.length >= MAX_ROUTE_LABELS - 1) continue;
    const own = r.edgeIds.filter((id) => !shared.has(id));
    const ownM = own.reduce((sum, id) => sum + (graph.edges[graph.edgeIndex.get(id) ?? -1]?.lengthM ?? 0), 0);
    if (ownM < OWN_ROAD_MIN_M || ownM < r.distanceM * OWN_ROAD_MIN_FRACTION) continue;
    const at = midOf(own[Math.floor(own.length / 2)]!);
    if (at) alts.push({ key: `label-${r.routeId}`, routeId: r.routeId, coordinate: toCoord(at), text: signed(r.etaS - primary.etaS), primary: false });
  }
  // The main route's bubble goes where it is farthest from those bubbles, so none hides another.
  const ids = primary.edgeIds;
  if (!ids.length) return alts;
  const first = midOf(ids[0]!);
  const last = midOf(ids[ids.length - 1]!);
  const spanM = first && last ? haversineM(first, last) : 0;
  const wanted = Math.max(MIN_BUBBLE_GAP_M, spanM * BUBBLE_GAP_FRACTION);
  let best: { at: LatLng; gap: number } | null = null;
  for (const f of MAIN_BUBBLE_AT) {
    const at = midOf(ids[Math.min(ids.length - 1, Math.floor(ids.length * f))]!);
    if (!at) continue;
    const gap = alts.reduce((m, l) => Math.min(m, haversineM(at, { lat: l.coordinate.latitude, lng: l.coordinate.longitude })), Infinity);
    if (!best || gap > best.gap) best = { at, gap };
    if (gap >= wanted) {
      best = { at, gap };
      break;
    }
  }
  const main: MapRouteLabel[] = best ? [{ key: `label-${primary.routeId}`, routeId: primary.routeId, coordinate: toCoord(best.at), text: fmtDuration(primary.etaS), primary: true }] : [];
  return [...main, ...alts];
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
  /** The route the traveller chose; null or absent means the recommended one. */
  selectedRouteId?: string | null;
}) {
  const { graph, plan, vehicle, transition, incidents, origin, destination, nowS, revealProgress, ctx, index, selectedRouteId } = args;

  const underlay = useMemo(() => floodProneSegments(graph), [graph]);

  const routes = plan?.routes;
  // The route drawn as the main (blue) one: the traveller's choice, else the engine's recommendation.
  const primaryId = useMemo(() => {
    const chosen = selectedRouteId ? routes?.find((r) => r.routeId === selectedRouteId && r.role !== 'blocked') : undefined;
    return chosen ? chosen.routeId : (plan?.recommendedRouteId ?? null);
  }, [routes, plan?.recommendedRouteId, selectedRouteId]);
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
      const style: RouteStyleKey = r.role === 'blocked' ? 'blocked' : r.routeId === primaryId ? 'recommended' : r.role === 'usual_fastest' ? 'usual_fastest' : 'alternative';
      const z = style === 'recommended' ? roleZ.recommended : style === 'blocked' ? roleZ.blocked : r.role === 'usual_fastest' ? roleZ.usual_fastest : roleZ.alternative;
      out.push({ key: `route-${r.role}-${r.routeId}`, routeId: r.routeId, coords, style, zIndex: z, casing: style !== 'blocked', reveal, flow });
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
  }, [graph, underlay, routes, transition, revealProgress, ctx, index, primaryId]);

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

  const routeLabels = useMemo(() => routeLabelsFor(graph, routes ?? [], primaryId), [graph, routes, primaryId]);

  return { lines, travelled, pins, vehiclePin, markers, routeLabels };
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
