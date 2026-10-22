import type { Incident, PlanNotice, Text, PlanResult, RouteEvaluation, Scenario, TripPosition } from '@vighnaway/contracts';
import { formatDuration } from '@vighnaway/contracts';
import type { Graph, VehicleState } from '@vighnaway/engine';
import {
  advanceVehicle,
  alertContext,
  followPlan,
  planTrip,
  remainingEtaS,
  replanFrom,
  startVehicle,
  vehiclePosition,
} from '@vighnaway/engine';
import { t } from '@/i18n';
import { incidentsKey } from './sync';

/**
 * Follows the scenario's demo trip exactly like the phone (packages/scenario-data/scripts/
 * replay.ts): planTrip from the origin, then on every incident change replanFrom with the
 * vehicle's current edge and fraction. Every routing decision comes from @vighnaway/engine.
 *
 * Vehicle position:
 * - 'phone': relayed by trip.position (display only; the console still decides on its own);
 * - 'local': no phone on a trip, so the vehicle is advanced in this browser from the simulation
 *   clock with the engine's advanceVehicle, as the replay script does;
 * - 'origin': no vehicle (page opened mid-run without a phone), routes planned from the origin.
 */
export type TripMode = 'origin' | 'local' | 'phone';

export interface TripChange {
  /** Increments with every change; drives the route-change motion. */
  id: number;
  atS: number;
  kind: 'invalid' | 'outperformed' | 'no_viable_route' | 'destination';
  message: string;
  /** Structured form of `message` for the active language (absent for a destination switch). */
  messageText?: Text;
  fromRouteId: string | null;
  toRouteId: string | null;
  /** Name of the route that was being followed (route ids change when re-planning from the vehicle). */
  fromRouteName: string | null;
  /** Route that lost, as it was being followed (dimmed during the motion). */
  oldEdgeIds: string[];
  /** Segment of the old route covered by the triggering incident (flashes red). */
  blockingEdgeIds: string[];
  triggerIncidentId: string | null;
  fromEtaS: number | null;
  toEtaS: number | null;
}

export interface TripState {
  mode: TripMode;
  destinationId: string;
  plan: PlanResult;
  vehicle: VehicleState | null;
  phone: TripPosition | null;
  /** Edges already driven, in order (display only). */
  trail: string[];
  simTimeS: number;
  incidentsKey: string;
  change: TripChange | null;
  changeCount: number;
  /** Latest engine notice that is not a change, e.g. "Route unchanged: one unverified report". */
  notice: PlanNotice | null;
  arrived: boolean;
}

export interface TripEnv {
  graph: Graph;
  scenario: Scenario;
}

/** A vehicle is simulated locally only if the console is watching from (near) the trip start. */
export const LOCAL_START_WINDOW_S = 30;

const placeNode = (scenario: Scenario, id: string): string | null => scenario.places.find((p) => p.id === id)?.nodeId ?? null;

export const recommendedRoute = (plan: PlanResult): RouteEvaluation | null =>
  plan.routes.find((r) => r.routeId === plan.recommendedRouteId) ?? null;

function conditions(env: TripEnv, incidents: readonly Incident[], nowS: number) {
  return {
    incidents,
    nowS,
    alerts: env.scenario.alerts,
    hasAlertInformation: env.scenario.hasAlertInformation,
  };
}

function ctxFor(env: TripEnv, nowS: number) {
  return alertContext(env.scenario.alerts, env.scenario.hasAlertInformation, nowS);
}

function planFromOrigin(env: TripEnv, destinationId: string, incidents: readonly Incident[], nowS: number, previous: RouteEvaluation | null): PlanResult {
  const { scenario, graph } = env;
  return planTrip({
    graph,
    origin: placeNode(scenario, scenario.demoTrip.originId) ?? '',
    destination: placeNode(scenario, destinationId) ?? '',
    ...conditions(env, incidents, nowS),
    previousRecommendation: previous ? { routeId: previous.routeId, edgeIds: previous.edgeIds } : null,
    places: scenario.places,
    destinationPlaceId: destinationId,
  });
}

function pushTrail(trail: string[], from: readonly string[], uptoExclusive: number): string[] {
  const out = [...trail];
  for (let i = 0; i < uptoExclusive; i++) {
    const id = from[i]!;
    if (out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

export function createTrip(env: TripEnv, incidents: readonly Incident[], simTimeS: number, allowLocalVehicle = true): TripState {
  const destinationId = env.scenario.demoTrip.destinationId;
  const plan = planFromOrigin(env, destinationId, incidents, simTimeS, null);
  const rec = recommendedRoute(plan);
  const start = env.scenario.demoTrip.startTripAtS;
  const local = allowLocalVehicle && rec !== null && simTimeS <= start + LOCAL_START_WINDOW_S;
  let vehicle: VehicleState | null = null;
  if (local) {
    vehicle = startVehicle(rec.edgeIds);
    const dt = simTimeS - start;
    if (dt > 0) {
      vehicle = advanceVehicle(env.graph, vehicle, dt, incidents, ctxFor(env, simTimeS), env.scenario.demoTrip.vehicleSpeedFactor);
    }
  }
  return {
    mode: local ? 'local' : 'origin',
    destinationId,
    plan,
    vehicle,
    phone: null,
    trail: vehicle ? pushTrail([], vehicle.edgeIds, vehicle.index) : [],
    simTimeS,
    incidentsKey: incidentsKey(incidents),
    change: null,
    changeCount: 0,
    notice: plan.notices.find((n) => n.kind !== 'no_viable_route') ?? null,
    arrived: vehicle?.arrived ?? false,
  };
}

/** Advances the locally simulated vehicle to simTimeS. */
export function tickTrip(env: TripEnv, s: TripState, simTimeS: number, incidents: readonly Incident[]): TripState {
  const dt = simTimeS - s.simTimeS;
  if (dt <= 0) return dt === 0 ? s : { ...s, simTimeS };
  if (s.mode !== 'local' || !s.vehicle || s.vehicle.arrived) return { ...s, simTimeS };
  const before = s.vehicle;
  const vehicle = advanceVehicle(env.graph, before, dt, incidents, ctxFor(env, simTimeS), env.scenario.demoTrip.vehicleSpeedFactor);
  const trail = vehicle.index > before.index ? pushTrail(s.trail, vehicle.edgeIds.slice(before.index), vehicle.index - before.index) : s.trail;
  return {
    ...s,
    simTimeS,
    vehicle,
    trail: vehicle.arrived ? pushTrail(trail, vehicle.edgeIds.slice(vehicle.index), 1) : trail,
    arrived: vehicle.arrived,
  };
}

/** A trip.position from the phone: the phone's vehicle replaces any local one. */
export function positionTrip(env: TripEnv, s: TripState, pos: TripPosition): TripState {
  if (pos.scenarioId !== env.scenario.id) return s;
  const prevEdge = s.mode === 'phone' ? s.phone?.edgeId ?? null : null;
  let trail = s.mode === 'phone' ? s.trail : [];
  if (prevEdge && pos.edgeId && prevEdge !== pos.edgeId && trail[trail.length - 1] !== prevEdge) trail = [...trail, prevEdge];
  return {
    ...s,
    mode: 'phone',
    phone: pos,
    vehicle: null,
    destinationId: pos.destinationId,
    trail,
    arrived: pos.status === 'arrived',
  };
}

function blockingEdges(plan: PlanResult, oldEdgeIds: readonly string[], incidents: readonly Incident[]): { edges: string[]; trigger: string | null } {
  const trigger = plan.change?.trigger?.incidentId ?? null;
  const inc = trigger ? incidents.find((i) => i.id === trigger) : undefined;
  if (!inc) return { edges: [], trigger };
  const set = new Set(inc.edgeIds);
  const onOld = oldEdgeIds.filter((id) => set.has(id));
  return { edges: onOld.length ? onOld : [...inc.edgeIds], trigger };
}

function followedEdges(s: TripState): string[] {
  if (s.mode === 'local' && s.vehicle) return s.vehicle.edgeIds.slice(s.vehicle.index);
  if (s.mode === 'phone' && s.phone) {
    const i = s.phone.edgeId ? s.phone.edgeIds.indexOf(s.phone.edgeId) : -1;
    return s.phone.edgeIds.slice(i >= 0 ? i : s.phone.travelledEdgeCount);
  }
  return recommendedRoute(s.plan)?.edgeIds ?? [];
}

/** Displayed ETA (seconds) of what the vehicle follows now. */
export function currentEtaS(env: TripEnv, s: TripState, incidents: readonly Incident[]): number | null {
  if (s.arrived) return 0;
  if (s.mode === 'local' && s.vehicle) return remainingEtaS(env.graph, s.vehicle, incidents, ctxFor(env, s.simTimeS));
  const rec = recommendedRoute(s.plan);
  return rec ? rec.etaS + s.plan.leadInS : null;
}

/**
 * Incidents changed: re-plan like the phone. nowS is the later of the last clock tick and the
 * newest incident update, so the engine never sees a report from its future.
 */
export function incidentsTrip(env: TripEnv, s0: TripState, incidents: readonly Incident[], tickS: number): TripState {
  const key = incidentsKey(incidents);
  if (key === s0.incidentsKey) return s0;
  const nowS = Math.max(tickS, s0.simTimeS, ...incidents.map((i) => i.updatedAtS));
  const s = tickTrip(env, s0, nowS, incidents);
  const oldRec = recommendedRoute(s.plan);
  const oldEdges = followedEdges(s);
  const oldEtaS = currentEtaS(env, s, incidents);
  let plan: PlanResult;
  let destinationId = s.destinationId;
  let vehicle = s.vehicle;
  let switchedTo: string | null = null;

  const phoneEnRoute = s.mode === 'phone' && s.phone?.status === 'en_route' && s.phone.edgeId;
  if (s.arrived) {
    return { ...s, incidentsKey: key, simTimeS: nowS };
  } else if (s.mode === 'local' && vehicle) {
    const pos = vehiclePosition(env.graph, vehicle);
    if (!pos) return { ...s, incidentsKey: key };
    const replan = (dest: string) =>
      replanFrom({
        graph: env.graph,
        destination: placeNode(env.scenario, dest) ?? '',
        currentRoute: vehicle!.edgeIds.slice(vehicle!.index),
        vehicle: { edgeId: pos.edgeId, fraction: vehicle!.fraction },
        ...conditions(env, incidents, nowS),
        places: env.scenario.places,
        destinationPlaceId: dest,
      });
    plan = replan(destinationId);
    if (plan.recommendedRouteId) vehicle = followPlan(env.graph, vehicle, plan);
    else if (plan.reachable) {
      const first = plan;
      destinationId = plan.reachable.placeId;
      switchedTo = first.change?.message ?? first.notices[0]?.message ?? t.route.noViable.title;
      plan = replan(destinationId);
      if (plan.recommendedRouteId) vehicle = followPlan(env.graph, vehicle, plan);
      if (!plan.change) plan = { ...plan, change: first.change };
    }
  } else if (phoneEnRoute && s.phone) {
    const p = s.phone;
    plan = replanFrom({
      graph: env.graph,
      destination: placeNode(env.scenario, p.destinationId) ?? '',
      currentRoute: followedEdges(s),
      vehicle: { edgeId: p.edgeId!, fraction: p.edgeFraction },
      ...conditions(env, incidents, nowS),
      places: env.scenario.places,
      destinationPlaceId: p.destinationId,
    });
  } else {
    plan = planFromOrigin(env, destinationId, incidents, nowS, oldRec);
  }

  const next: TripState = {
    ...s,
    plan,
    vehicle,
    destinationId,
    simTimeS: nowS,
    incidentsKey: key,
    notice: plan.change ? null : (plan.notices.find((n) => n.kind === 'unchanged_with_hazard' || n.kind === 'on_blocked_edge') ?? null),
  };
  if (plan.change || switchedTo) {
    const { edges, trigger } = blockingEdges(plan, oldEdges, incidents);
    const newRec = recommendedRoute(plan);
    const place = env.scenario.places.find((p) => p.id === destinationId);
    const message = switchedTo
      ? `${switchedTo} ${t.route.noViable.nearest(place?.name ?? destinationId, formatDuration(newRec ? newRec.etaS + plan.leadInS : 0))}.`
      : plan.change!.message;
    next.change = {
      id: s.changeCount + 1,
      atS: nowS,
      kind: switchedTo ? 'destination' : plan.change!.kind,
      message,
      ...(!switchedTo && plan.change!.messageText ? { messageText: plan.change!.messageText } : {}),
      fromRouteId: oldRec?.routeId ?? null,
      toRouteId: plan.recommendedRouteId,
      fromRouteName: oldRec?.name ?? null,
      oldEdgeIds: oldEdges,
      blockingEdgeIds: edges,
      triggerIncidentId: trigger,
      fromEtaS: oldEtaS,
      toEtaS: null,
    };
    next.changeCount = s.changeCount + 1;
    next.change.toEtaS = currentEtaS(env, next, incidents);
  }
  return next;
}

/** Edges to draw for the route being followed now: the vehicle's current edge, then the plan. */
export function followedDisplayEdges(s: TripState): string[] {
  const rec = recommendedRoute(s.plan);
  if (!rec) return [];
  const current = s.mode === 'local' ? s.vehicle?.edgeIds[s.vehicle.index] : s.mode === 'phone' ? s.phone?.edgeId : null;
  if (current && rec.edgeIds[0] !== current && !s.arrived) return [current, ...rec.edgeIds];
  return rec.edgeIds;
}

export function vehicleMarker(env: TripEnv, s: TripState): { lat: number; lng: number; headingDeg: number } | null {
  if (s.mode === 'local' && s.vehicle) {
    const p = vehiclePosition(env.graph, s.vehicle);
    return p ? { ...p.point, headingDeg: p.headingDeg } : null;
  }
  if (s.mode === 'phone' && s.phone) return { ...s.phone.coordinate, headingDeg: s.phone.headingDeg };
  return null;
}
