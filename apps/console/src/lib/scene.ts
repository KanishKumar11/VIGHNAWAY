import type { GraphFile, Incident, LatLng, LngLatTuple, Place, RouteRole } from '@vighnaway/contracts';
import type { Graph, RouteSegmentFlow } from '@vighnaway/engine';
import { alertContext, flowDurationMs, routeFlow, routeGeometry } from '@vighnaway/engine';
import { routeStyles, zIndex } from '@vighnaway/tokens';
import type { MotionPhase } from '@/hooks/useRouteChangeMotion';
import type { TripChange, TripEnv, TripState } from './demoTrip';
import { followedDisplayEdges, recommendedRoute, vehicleMarker } from './demoTrip';

/**
 * Everything both map renderers draw, built once from the engine's plan so the Google map and the
 * schematic view are styled identically (tokens.routeStyles, tokens.zIndex).
 */
export type LineKind = RouteRole | 'travelled' | 'floodProne' | 'old' | 'blocking';

export interface SceneLine {
  key: string;
  kind: LineKind;
  coords: LngLatTuple[];
  color: string;
  width: number;
  casing: string | null;
  casingWidth: number;
  opacity: number;
  dash: readonly number[] | null;
  z: number;
  /** Opacity changes animate (route fade-in / dim). */
  fade: boolean;
  /** Graph edges behind the line, so the schematic view can draw it on its display geometry. */
  edgeIds?: readonly string[];
  /**
   * Modelled traffic along the line (engine routeFlow), as runs of consecutive edges with the same
   * state: drawn statically (congested segments get a distinct treatment, blocked ones are
   * interrupted), so speed reads in a still screenshot. Presentation only.
   */
  flow?: FlowRun[];
}

export type FlowState = 'free' | 'slow' | 'jam' | 'blocked';
export interface FlowRun {
  edgeIds: string[];
  state: FlowState;
  /** Dash travel time at this speed (engine flowDurationMs); null when blocked. */
  durationMs: number | null;
  speedKmh: number;
}

/** Slowdown 1 is free flow; up to 2 slow; above that a jam; Infinity blocked. */
export const flowState = (seg: Pick<RouteSegmentFlow, 'slowdown' | 'blocked'>): FlowState =>
  seg.blocked ? 'blocked' : seg.slowdown <= 1.05 ? 'free' : seg.slowdown <= 2 ? 'slow' : 'jam';

/** Groups consecutive edges with the same flow state into runs. Pure. */
export function flowRuns(segs: readonly RouteSegmentFlow[]): FlowRun[] {
  const out: FlowRun[] = [];
  for (const seg of segs) {
    const state = flowState(seg);
    const last = out[out.length - 1];
    if (last && last.state === state) last.edgeIds.push(seg.edgeId);
    else out.push({ edgeIds: [seg.edgeId], state, durationMs: flowDurationMs(seg), speedKmh: seg.speedKmh });
  }
  return out;
}

/** Where the change happened, for the restrained flood contour or block mark during the change. */
export interface SceneFocus {
  point: LatLng;
  kind: 'flood' | 'block';
  /** Ankle, knee or waist sets the contour size. */
  depth: 'ankle' | 'knee' | 'waist' | null;
  changeId: number;
}

export interface SceneMarker {
  key: string;
  point: LatLng;
  label: string;
}

export interface MapScene {
  lines: SceneLine[];
  /** Cross markers on the segment that makes a route not viable. */
  blockedCrosses: SceneMarker[];
  vehicle: { lat: number; lng: number; headingDeg: number } | null;
  origin: Place | null;
  destination: Place | null;
  otherPlaces: Place[];
  /** Set only while a route change plays (flash and transition). */
  focus: SceneFocus | null;
}

const style = (k: keyof typeof routeStyles) => routeStyles[k];

function line(key: string, kind: LineKind, coords: LngLatTuple[], s: (typeof routeStyles)[keyof typeof routeStyles], z: number, over: Partial<SceneLine> = {}): SceneLine {
  return {
    key,
    kind,
    coords,
    color: s.color,
    width: s.width,
    casing: s.casing,
    casingWidth: s.casingWidth,
    opacity: s.opacity,
    dash: s.dash,
    z,
    fade: false,
    ...over,
  };
}

const midpoint = (coords: LngLatTuple[]): LatLng | null => {
  if (!coords.length) return null;
  const c = coords[Math.floor((coords.length - 1) / 2)]!;
  const d = coords[Math.ceil((coords.length - 1) / 2)]!;
  return { lng: (c[0] + d[0]) / 2, lat: (c[1] + d[1]) / 2 };
};

/** Flood-prone underlay: one line per two-way road (twins drawn once). */
export function floodProneLines(file: GraphFile): SceneLine[] {
  const seen = new Set<string>();
  const out: SceneLine[] = [];
  for (const e of file.edges) {
    if (!e.floodProne || seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.reverseId) seen.add(e.reverseId);
    out.push(line(`fp-${e.id}`, 'floodProne', e.geometry, style('floodProne'), zIndex.floodProne, { edgeIds: [e.id] }));
  }
  return out;
}

export interface MotionInput {
  phase: MotionPhase;
  flashOn: boolean;
  change: Pick<TripChange, 'id'> | null;
}

export function buildScene(env: TripEnv, file: GraphFile, trip: TripState | null, motion: MotionInput, incidents: readonly Incident[] = []): MapScene {
  const graph: Graph = env.graph;
  const places = env.scenario.places;
  const origin = places.find((p) => p.id === env.scenario.demoTrip.originId) ?? null;
  const destination = places.find((p) => p.id === (trip?.destinationId ?? env.scenario.demoTrip.destinationId)) ?? null;
  const otherPlaces = places.filter((p) => p.kind === 'hospital' && p.id !== destination?.id);
  const lines: SceneLine[] = [...floodProneLines(file)];
  const blockedCrosses: SceneMarker[] = [];
  if (!trip) return { lines, blockedCrosses, vehicle: null, origin, destination, otherPlaces, focus: null };
  const ctx = alertContext(env.scenario.alerts, env.scenario.hasAlertInformation, trip.simTimeS);
  const flowOf = (edgeIds: readonly string[]): FlowRun[] | undefined =>
    incidents.length ? flowRuns(routeFlow(graph, edgeIds, incidents, ctx)) : undefined;

  // A change the motion hook has not picked up yet counts as the start of the flash, so the new
  // route never shows for a frame before the sequence begins.
  const change = trip.change;
  const pending = change !== null && motion.change?.id !== change.id;
  const phase: MotionPhase = pending ? 'flash' : motion.phase;
  const flashOn = pending ? true : motion.flashOn;
  const animating = change !== null && (phase === 'flash' || phase === 'transition');
  const rec = recommendedRoute(trip.plan);

  for (const r of trip.plan.routes) {
    if (r.routeId === rec?.routeId) continue;
    const coords = routeGeometry(graph, r.edgeIds);
    lines.push(line(`r-${r.role}-${r.routeId}`, r.role, coords, style(r.role), zIndex[r.role], { edgeIds: r.edgeIds, flow: r.role === 'blocked' ? undefined : flowOf(r.edgeIds) }));
    if (r.role === 'blocked' && r.blockedBy[0]) {
      const p = midpoint(routeGeometry(graph, [r.blockedBy[0].edgeId]));
      if (p) blockedCrosses.push({ key: `x-${r.routeId}`, point: p, label: r.name });
    }
  }

  if (rec) {
    const edgeIds = followedDisplayEdges(trip);
    const coords = routeGeometry(graph, edgeIds);
    const hidden = animating && phase === 'flash';
    lines.push(
      line(`rec-${trip.change?.id ?? 0}`, 'recommended', coords, style('recommended'), zIndex.recommended, { opacity: hidden ? 0 : 1, fade: true, edgeIds, flow: flowOf(edgeIds) }),
    );
  }

  if (trip.trail.length) {
    lines.push(line('travelled', 'travelled', routeGeometry(graph, trip.trail), style('travelled'), zIndex.travelled, { edgeIds: trip.trail }));
  }

  if (animating && change) {
    const old = routeGeometry(graph, change.oldEdgeIds);
    if (phase === 'flash') {
      lines.push(line(`old-${change.id}`, 'old', old, style('recommended'), zIndex.recommended - 0.5, { edgeIds: change.oldEdgeIds }));
    } else {
      // Sinks: thins to a dashed slate stroke, then fades out (DESIGN.md section 6).
      lines.push(line(`old-${change.id}`, 'old', old, style('alternative'), zIndex.recommended - 0.5, { opacity: 0, fade: true, dash: [3, 7], edgeIds: change.oldEdgeIds }));
    }
    if (phase === 'flash' && change.blockingEdgeIds.length) {
      lines.push(
        line(`blk-${change.id}`, 'blocking', routeGeometry(graph, change.blockingEdgeIds), style('blocked'), zIndex.blockingMarker, {
          width: style('recommended').casingWidth,
          dash: null,
          opacity: flashOn ? 1 : 0,
          edgeIds: change.blockingEdgeIds,
        }),
      );
    }
  }

  lines.sort((a, b) => a.z - b.z);
  let focus: SceneFocus | null = null;
  if (animating && change?.triggerIncidentId) {
    const inc = incidents.find((i) => i.id === change.triggerIncidentId);
    if (inc) focus = { point: inc.point, kind: inc.type === 'flood' ? 'flood' : 'block', depth: inc.type === 'flood' ? (inc.depth ?? null) : null, changeId: change.id };
  }
  return { lines, blockedCrosses, vehicle: vehicleMarker(env, trip), origin, destination, otherPlaces, focus };
}

/** Approximate railway line through the crossing midpoints (schematic view only, labelled). */
export function approximateRailway(file: GraphFile): LngLatTuple[] | null {
  const pts: { lat: number; lng: number }[] = [];
  const seen = new Set<string>();
  for (const e of file.edges) {
    if (!(e.tunnel || e.bridge) || seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.reverseId) seen.add(e.reverseId);
    const m = midpoint(e.geometry);
    if (m) pts.push(m);
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
  const b = den === 0 ? 0 : num / den;
  const at = (lat: number): LngLatTuple => [mLng + b * (lat - mLat), lat];
  return [at(file.bbox.south), at(file.bbox.north)];
}

/** Base road lines for the schematic view (twins drawn once). */
export function baseRoads(file: GraphFile): { key: string; coords: LngLatTuple[]; major: boolean; footway: boolean }[] {
  const seen = new Set<string>();
  const out: { key: string; coords: LngLatTuple[]; major: boolean; footway: boolean }[] = [];
  for (const e of file.edges) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.reverseId) seen.add(e.reverseId);
    out.push({
      key: e.id,
      coords: e.geometry,
      major: ['motorway', 'trunk', 'primary'].includes(e.highway),
      footway: ['footway', 'path', 'steps', 'pedestrian'].includes(e.highway),
    });
  }
  return out;
}
