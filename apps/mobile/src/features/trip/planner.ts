import type { LatLng, PlanResult, RouteEvaluation } from '@vighnaway/contracts';
import type { Place } from '@vighnaway/contracts';
import { followPlan, haversineM, nodePoint, planTrip, replanFrom, snapToNode, startVehicle, vehiclePosition, type Graph, type VehicleState } from '@vighnaway/engine';
import { graphForRegion, regionOfPoint } from '@/regions';
import { t } from '@/i18n/en';
import { changeText, noticeText, routeLabel, speechFor } from '@/i18n/engineText';
import { getGraph } from '@/lib/engine';
import { announce, haptic } from '@/lib/feedback';
import { dur } from '@/lib/motion';
import { notifyIfBackgrounded } from '@/lib/notifications';
import { commuteAlertFor, useCommute } from '@/features/commute/commute';
import { speakChange } from '@/lib/speech';
import { useActivity } from '@/stores/activity';
import { useIncidents } from '@/stores/incidents';
import { isCustomPlaceId, placeById, registerCustomPlace, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { entryNodeFor } from '@/features/guidance/access';
import { usePlanGate } from './planGate';
import { useSim } from '@/stores/sim';
import { useToast } from '@/stores/toast';
import { activeRoute, recommendedRoute, useTrip, type Transition } from '@/stores/trip';
import { motion } from '@/theme';

/**
 * Runs the engine for the current trip. Not en route: planTrip with the current recommendation as
 * the previous one (switching rule). En route: replanFrom the vehicle's edge and fraction, then
 * followPlan. Every recommendation change plays the route-change moment and its alerts.
 */
export function planContextKey(): string {
  const { profile } = useSettings.getState();
  const { originId, destinationId } = useTrip.getState();
  // The nodes a local road joins the network at are part of the trip: finding them is a new plan, not a route change.
  const joins = `${entryNodeFor('from') ?? ''}/${entryNodeFor('to') ?? ''}`;
  return `${profile}|${originId}|${destinationId ?? 'none'}${joins === '/' ? '' : `|${joins}`}`;
}

export interface PlanOutcome {
  plan: PlanResult;
  vehicle: VehicleState | null;
}

/** A searched place or the phone's position is re-snapped for the profile, whose graph can differ. */
function nodeFor(graph: Graph, place: Place): string {
  return isCustomPlaceId(place.id) ? (snapToNode(graph, place.point) ?? place.nodeId) : place.nodeId;
}

export function computePlan(): PlanOutcome | null {
  const { scenario, graphFile, region } = useScenario.getState();
  const { profile, preferLit } = useSettings.getState();
  const trip = useTrip.getState();
  // The corridor map has roads only: no incidents, alerts or scenario places apply to it.
  const roadsOnly = region !== 'andheri';
  const incidents = roadsOnly ? [] : Object.values(useIncidents.getState().byId);
  const nowS = useSim.getState().simTimeS;
  const graph = getGraph(graphFile, profile);
  const origin = placeById(scenario, trip.originId);
  const dest = placeById(scenario, trip.destinationId);
  if (!origin || !dest) return null;
  // A local road found from the start (or to the destination) says where on the network the trip joins it.
  const originNode = entryNodeFor('from') ?? nodeFor(graph, origin);
  const destNode = entryNodeFor('to') ?? nodeFor(graph, dest);
  const conditions = {
    incidents,
    nowS,
    alerts: roadsOnly ? [] : scenario.alerts,
    hasAlertInformation: roadsOnly ? false : scenario.hasAlertInformation,
    places: roadsOnly ? [] : scenario.places,
    destinationPlaceId: dest.id,
    // "Prefer well-lit roads" (P2-9): walking only, ranking only. The walking concerns are passed separately because
    // the engine keeps them out of routing unless this preference is on.
    ...(preferLit && profile === 'foot' ? { preferLit: true, walkingConcerns: incidents.filter((i) => i.type === 'walking_concern') } : {}),
  };
  const context = planContextKey();

  if (trip.mode === 'en_route' && trip.vehicle && !trip.vehicle.arrived) {
    const pos = vehiclePosition(graph, trip.vehicle);
    if (pos) {
      const plan = replanFrom({
        graph,
        destination: destNode,
        currentRoute: trip.vehicle.edgeIds.slice(trip.vehicle.index),
        vehicle: { edgeId: pos.edgeId, fraction: trip.vehicle.fraction },
        ...conditions,
      });
      const vehicle = plan.recommendedRouteId ? followPlan(graph, trip.vehicle, plan) : trip.vehicle;
      return { plan, vehicle };
    }
  }

  const prev = trip.planContext === context ? recommendedRoute(trip.plan) : null;
  const plan = planTrip({
    graph,
    origin: originNode,
    destination: destNode,
    previousRecommendation: prev ? { routeId: prev.routeId, edgeIds: prev.edgeIds } : null,
    ...conditions,
  });
  return { plan, vehicle: null };
}

/** Simulated mode keeps "(simulated scenario)" in the notification title; live data does not. */
const notificationTitle = () => t(useSettings.getState().dataMode === 'live' ? 'notificationTitleLive' : 'notificationTitle');

let timer: ReturnType<typeof setTimeout> | null = null;
let evaluatingSince = 0;

/** A plan asked for while planning was paused (a screen without the map is in front); made when it resumes. */
let owed: { showEvaluating: boolean } | null = null;

/** Pauses or resumes planning (features/trip/planGate.ts). Resuming makes the plan that was asked for meanwhile, once. */
export function setPlanningPaused(paused: boolean): void {
  usePlanGate.getState().setPaused(paused);
  if (!paused && owed) {
    const o = owed;
    owed = null;
    // A short delay lets a hand-over between two paused screens settle first.
    schedulePlan({ showEvaluating: o.showEvaluating, delayMs: 60 });
  }
}

/** Debounced recompute: waits for interactions and bursts of incident events to settle. */
export function schedulePlan(opts: { showEvaluating?: boolean; delayMs?: number } = {}): void {
  if (timer) clearTimeout(timer);
  if (opts.showEvaluating) {
    evaluatingSince = Date.now();
    useTrip.getState().setEvaluating(true);
  }
  if (usePlanGate.getState().paused) {
    owed = { showEvaluating: !!opts.showEvaluating || !!owed?.showEvaluating };
    timer = null;
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    if (usePlanGate.getState().paused) {
      owed = { showEvaluating: owed?.showEvaluating ?? false };
      return;
    }
    runPlanNow();
  }, opts.delayMs ?? 150);
}

export function runPlanNow(): PlanResult | null {
  const before = useTrip.getState();
  const outcome = computePlan();
  if (!outcome) {
    // No destination yet (or a place that cannot be planned): nothing to show and nothing to wait for.
    if (before.plan || before.evaluating) useTrip.setState({ plan: null, planContext: null, evaluating: false });
    return null;
  }
  const { plan, vehicle } = outcome;
  const context = planContextKey();
  const contextChanged = before.planContext !== context;
  useTrip.getState().setPlan(plan, context, before.mode === 'en_route' ? vehicle : undefined);

  // Evaluating shimmer stays at least motion.evaluatingMin so it never flickers.
  if (useTrip.getState().evaluating) {
    const left = dur(motion.evaluatingMin) - (Date.now() - evaluatingSince);
    if (left > 0) setTimeout(() => useTrip.getState().setEvaluating(false), left);
    else useTrip.getState().setEvaluating(false);
  }

  handleOutcome(before.plan, plan, contextChanged);
  return plan;
}

function handleOutcome(prevPlan: PlanResult | null, plan: PlanResult, contextChanged: boolean): void {
  const trip = useTrip.getState();
  const nowS = plan.evaluatedAtS;
  const activity = useActivity.getState();
  const rec = recommendedRoute(plan);

  if (contextChanged || !prevPlan) {
    trip.pushHistory({ atS: nowS, routeId: rec?.routeId ?? null, name: rec?.name ?? null });
  }

  if (plan.change) {
    const change = plan.change;
    // A change supersedes any "Route unchanged" toast still on screen; a plan with a change never
    // raises one (the notices below are skipped).
    useToast.getState().clearTag(UNCHANGED_TOAST);
    trip.pushHistory({ atS: nowS, routeId: change.toRouteId, name: rec?.name ?? null });
    const fromRoute: RouteEvaluation | null =
      recommendedRoute(prevPlan) ?? prevPlan?.routes.find((r) => r.routeId === change.fromRouteId) ?? null;
    const blockedEdgeId =
      plan.routes.find((r) => r.routeId === change.fromRouteId)?.blockedBy[0]?.edgeId ??
      fromRoute?.edgeIds.find((id) => plan.routes.some((r) => r.blockedBy.some((b) => b.edgeId === id))) ??
      null;
    const text = changeText(plan) ?? { message: change.message, tradeOff: change.tradeOff };
    haptic.warning();
    trip.showBanner({
      tone: plan.isReversal || change.kind === 'no_viable_route' ? 'danger' : 'change',
      title: change.kind === 'no_viable_route' ? t('noViableTitle') : t('routeChangedTitle'),
      message: text.message,
      tradeOff: text.tradeOff,
      atS: nowS,
      incidentId: change.trigger?.incidentId ?? null,
    });
    announce(text.message);
    void speakChange(speechFor(plan));
    activity.add({
      atS: nowS,
      kind: change.kind === 'no_viable_route' ? 'no_viable_route' : 'route_changed',
      text: text.message,
    });
    void notifyIfBackgrounded(notificationTitle(), text.message);
    startTransition(fromRoute, change.toRouteId, blockedEdgeId);
    return;
  }

  for (const notice of plan.notices) {
    const message = noticeText(notice);
    const key = `${notice.kind}|${notice.message}|${plan.incidentCount}|${useIncidents.getState().lastSeq}`;
    if (notice.kind === 'unchanged_with_hazard') {
      // Never say "Route unchanged" while the "Route changed" banner is still on screen; the
      // activity entry is still recorded.
      const changeBannerUp = useTrip.getState().banner?.tone === 'change';
      if (activity.add({ atS: nowS, kind: 'unchanged', text: message, dedupeKey: key }) && !changeBannerUp) {
        useToast.getState().show(message, 'warn', UNCHANGED_TOAST);
      }
    } else if (notice.kind === 'reversal' || notice.kind === 'on_blocked_edge') {
      if (activity.add({ atS: nowS, kind: 'warning', text: message, dedupeKey: key })) {
        haptic.warning();
        trip.showBanner({
          tone: 'danger',
          title: notice.kind === 'reversal' ? t('routeChangedTitle') : t('hazardOnRoadTitle'),
          message,
          tradeOff: '',
          atS: nowS,
          incidentId: null,
        });
        announce(message);
        void notifyIfBackgrounded(notificationTitle(), message);
      }
    }
  }
  if (plan.noViableRoute && !prevPlan?.noViableRoute) {
    haptic.warning();
    announce(t('noViableTitle'));
  }
  checkCommute(plan, nowS);
}

/** Commute watch (P2-7): tell the traveller only when the recommendation differs from their saved usual route. */
function checkCommute(plan: PlanResult, nowS: number): void {
  const { saved, markAlerted } = useCommute.getState();
  if (!saved) return;
  const { originId, destinationId } = useTrip.getState();
  if (!originId || !destinationId) return;
  const profile = useSettings.getState().profile;
  const alert = commuteAlertFor(saved, { originId, destinationId, profile }, plan);
  if (!alert) {
    // Back on the usual route (or another trip): the next difference is news again.
    if (saved.lastAlertRouteId !== null && recommendedRoute(plan)?.routeId === saved.usualRouteId) markAlerted(null);
    return;
  }
  markAlerted(alert.routeId);
  const text = t('commuteAlert', { to: alert.destinationName, usual: alert.usualName, route: alert.routeName });
  useActivity.getState().add({ atS: nowS, kind: 'route_changed', text, dedupeKey: `commute|${alert.routeId}` });
  void notifyIfBackgrounded(t('commuteAlertTitle'), text);
}

const UNCHANGED_TOAST = 'unchanged';

let transitionId = 1;
const timers: ReturnType<typeof setTimeout>[] = [];

/**
 * Route-change moment: blocking segment flashes twice, then the new route reveals while the old
 * one is dimmed; about 900 ms in total. Instant with reduce motion; frozen mid-reveal for the hero
 * fixture.
 */
export function startTransition(fromRoute: RouteEvaluation | null, toRouteId: string | null, blockedEdgeId: string | null): void {
  timers.splice(0).forEach(clearTimeout);
  const id = transitionId++;
  const frozen = useSettings.getState().fixtureMode === 'change';
  const set = useTrip.getState().setTransition;
  const patch = (p: Partial<Transition>) => useTrip.getState().patchTransition(id, p);
  if (frozen) {
    set({ id, fromRoute, toRouteId, blockedEdgeId, phase: 'reveal', progress: 0.5, frozen: true });
    return;
  }
  if (dur(motion.routeChangeTotal) === 0) {
    set(null);
    return;
  }
  set({ id, fromRoute, toRouteId, blockedEdgeId, phase: 'flash', progress: 0, frozen: false });
  const flash = motion.routeChangeFlash;
  // Two flashes: on (0), off (150), on (300), off (450); then the reveal.
  for (let i = 1; i < 4; i++) timers.push(setTimeout(() => patch({ progress: i / 4 }), flash * i));
  const revealStart = flash * 4;
  const revealMs = motion.routeChangeTotal - revealStart;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    timers.push(setTimeout(() => patch({ phase: 'reveal', progress: i / steps }), revealStart + (revealMs * i) / steps));
  }
  timers.push(
    setTimeout(() => {
      if (useTrip.getState().transition?.id === id) set(null);
    }, motion.routeChangeTotal + 100),
  );
}

/** Start trip: the simulated vehicle sets off along the recommended route. */
export function startTrip(): void {
  const trip = useTrip.getState();
  // The route the traveller chose, else the recommended one.
  const rec = activeRoute(trip.plan, trip.selectedRouteId);
  if (!rec) return;
  const simTimeS = useSim.getState().simTimeS;
  trip.startTrip(startVehicle(rec.edgeIds), simTimeS);
  trip.dismissBanner();
  useActivity.getState().add({ atS: simTimeS, kind: 'trip', text: t('activityTripStarted', { name: routeLabel(rec) }) });
}

export function endTrip(): void {
  useTrip.getState().endTrip();
  schedulePlan({ delayMs: 0 });
}

export type PlaceRole = 'from' | 'to';
export type ChooseResult = 'ok' | 'same' | 'en_route' | 'outside' | 'different_regions' | 'no_road';

/** Two ends this close are the same place for routing purposes. */
const SAME_PLACE_M = 50;
/** On the corridor map a start or end farther than this from every mapped road has no usable route. */
const ACCESS_MAX_M = 15_000;

/** Distance from a point to the road node the engine would start or end at. */
function accessM(graph: Graph, point: LatLng): number {
  const id = snapToNode(graph, point);
  const idx = id === null ? undefined : graph.nodeIndex.get(id);
  return idx === undefined ? Infinity : haversineM(point, nodePoint(graph, idx));
}

/**
 * Starts a new trip from a place with no destination yet, as Google Maps does: the app opens on where
 * the traveller is and asks where to. Moves to the road map the start is on, and drops any plan,
 * destination and choice from before.
 */
export function setStartOnly(from: Place): ChooseResult {
  const trip = useTrip.getState();
  if (trip.mode !== 'planning') return 'en_route';
  const region = regionOfPoint(from.point);
  if (!region) return 'outside';
  registerCustomPlace(from);
  const scenarioState = useScenario.getState();
  if (scenarioState.region !== region) scenarioState.setRegion(region);
  useTrip.setState({
    originId: from.id,
    destinationId: null,
    plan: null,
    planContext: null,
    history: [],
    banner: null,
    transition: null,
    selectedRouteId: null,
    access: null,
    evaluating: false,
  });
  return 'ok';
}

/**
 * Sets the whole trip at once: start and destination from the search sheet. Both must lie in the
 * same map region (Andheri, or the Amritsar to Ambala corridor); the app moves to that region's
 * graph and plans there. Returns why it refused, if it did.
 */
export function setTripPlaces(from: Place, to: Place): ChooseResult {
  const trip = useTrip.getState();
  if (trip.mode !== 'planning') return 'en_route';
  const regionFrom = regionOfPoint(from.point);
  const regionTo = regionOfPoint(to.point);
  if (!regionFrom || !regionTo) return 'outside';
  if (regionFrom !== regionTo) return 'different_regions';
  if (from.id === to.id || haversineM(from.point, to.point) < SAME_PLACE_M) return 'same';

  const graph = getGraph(graphForRegion(regionFrom), useSettings.getState().profile);
  const fromM = accessM(graph, from.point);
  const toM = accessM(graph, to.point);
  if (regionFrom === 'north' && (fromM > ACCESS_MAX_M || toM > ACCESS_MAX_M)) return 'no_road';

  registerCustomPlace(from);
  registerCustomPlace(to);
  const scenarioState = useScenario.getState();
  if (scenarioState.region !== regionFrom) {
    // Another map: the old plan, history and banner belong to the old graph.
    scenarioState.setRegion(regionFrom);
    useTrip.setState({ plan: null, planContext: null, history: [], banner: null, transition: null });
  }
  if (trip.originId !== from.id) {
    trip.setOrigin(from.id);
    useActivity.getState().add({ atS: useSim.getState().simTimeS, kind: 'trip', text: t('activityOrigin', { place: from.name }) });
  }
  if (trip.destinationId !== to.id) {
    trip.setDestination(to.id);
    useActivity.getState().add({ atS: useSim.getState().simTimeS, kind: 'trip', text: t('activityDestination', { place: to.name }) });
  }
  trip.setAccess({ fromM: Math.round(fromM), toM: Math.round(toM) });
  schedulePlan({ showEvaluating: true, delayMs: 0 });
  return 'ok';
}

/**
 * Sets the trip's start or destination from a search result or the phone's position. The start
 * cannot change mid-trip (the vehicle is the start then); a start equal to the destination is refused.
 */
export function choosePlace(role: PlaceRole, place: Place): ChooseResult {
  const trip = useTrip.getState();
  if (role === 'from' && trip.mode !== 'planning') return 'en_route';
  const scenario = useScenario.getState().scenario;
  // One end alone cannot move the trip to another map: the other end is on the current one.
  const placeRegion = regionOfPoint(place.point);
  if (!placeRegion) return 'outside';
  if (placeRegion !== useScenario.getState().region) return 'different_regions';
  registerCustomPlace(place);
  const other = placeById(scenario, role === 'from' ? trip.destinationId : trip.originId);
  if (other && (other.id === place.id || haversineM(other.point, place.point) < SAME_PLACE_M)) return 'same';
  if (role === 'to') {
    changeDestination(place.id);
    return 'ok';
  }
  if (trip.originId !== place.id) {
    trip.setOrigin(place.id);
    useActivity.getState().add({ atS: useSim.getState().simTimeS, kind: 'trip', text: t('activityOrigin', { place: place.name }) });
  }
  schedulePlan({ showEvaluating: true, delayMs: 0 });
  return 'ok';
}

/** Switch destination (e.g. "Go to {place}" when the destination is not reachable). */
export function changeDestination(placeId: string): void {
  const trip = useTrip.getState();
  if (trip.destinationId === placeId) return;
  const place = placeById(useScenario.getState().scenario, placeId);
  trip.setDestination(placeId);
  if (place) {
    useActivity.getState().add({
      atS: useSim.getState().simTimeS,
      kind: 'trip',
      text: t('activityDestination', { place: place.name }),
    });
  }
  schedulePlan({ showEvaluating: trip.mode !== 'en_route', delayMs: 0 });
}
