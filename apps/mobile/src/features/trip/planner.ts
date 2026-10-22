import type { PlanResult, RouteEvaluation } from '@vighnaway/contracts';
import { followPlan, planTrip, replanFrom, startVehicle, vehiclePosition, type VehicleState } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { changeText, noticeText, routeName, speechFor } from '@/i18n/engineText';
import { getGraph } from '@/lib/engine';
import { announce, haptic } from '@/lib/feedback';
import { dur } from '@/lib/motion';
import { notifyIfBackgrounded } from '@/lib/notifications';
import { speakChange } from '@/lib/speech';
import { useActivity } from '@/stores/activity';
import { useIncidents } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useToast } from '@/stores/toast';
import { recommendedRoute, useTrip, type Transition } from '@/stores/trip';
import { motion } from '@/theme';

/**
 * Runs the engine for the current trip. Not en route: planTrip with the current recommendation as
 * the previous one (switching rule). En route: replanFrom the vehicle's edge and fraction, then
 * followPlan. Every recommendation change plays the route-change moment and its alerts.
 */
export function planContextKey(): string {
  const { profile } = useSettings.getState();
  const { originId, destinationId } = useTrip.getState();
  return `${profile}|${originId}|${destinationId}`;
}

export interface PlanOutcome {
  plan: PlanResult;
  vehicle: VehicleState | null;
}

export function computePlan(): PlanOutcome | null {
  const { scenario, graphFile } = useScenario.getState();
  const { profile } = useSettings.getState();
  const trip = useTrip.getState();
  const incidents = Object.values(useIncidents.getState().byId);
  const nowS = useSim.getState().simTimeS;
  const graph = getGraph(graphFile, profile);
  const origin = placeById(scenario, trip.originId);
  const dest = placeById(scenario, trip.destinationId);
  if (!origin || !dest) return null;
  const conditions = {
    incidents,
    nowS,
    alerts: scenario.alerts,
    hasAlertInformation: scenario.hasAlertInformation,
    places: scenario.places,
    destinationPlaceId: dest.id,
  };
  const context = planContextKey();

  if (trip.mode === 'en_route' && trip.vehicle && !trip.vehicle.arrived) {
    const pos = vehiclePosition(graph, trip.vehicle);
    if (pos) {
      const plan = replanFrom({
        graph,
        destination: dest.nodeId,
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
    origin: origin.nodeId,
    destination: dest.nodeId,
    previousRecommendation: prev ? { routeId: prev.routeId, edgeIds: prev.edgeIds } : null,
    ...conditions,
  });
  return { plan, vehicle: null };
}

/** Simulated mode keeps "(simulated scenario)" in the notification title; live data does not. */
const notificationTitle = () => t(useSettings.getState().dataMode === 'live' ? 'notificationTitleLive' : 'notificationTitle');

let timer: ReturnType<typeof setTimeout> | null = null;
let evaluatingSince = 0;

/** Debounced recompute: waits for interactions and bursts of incident events to settle. */
export function schedulePlan(opts: { showEvaluating?: boolean; delayMs?: number } = {}): void {
  if (timer) clearTimeout(timer);
  if (opts.showEvaluating) {
    evaluatingSince = Date.now();
    useTrip.getState().setEvaluating(true);
  }
  timer = setTimeout(() => {
    timer = null;
    runPlanNow();
  }, opts.delayMs ?? 150);
}

export function runPlanNow(): PlanResult | null {
  const before = useTrip.getState();
  const outcome = computePlan();
  if (!outcome) return null;
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
    const byId = useIncidents.getState().byId;
    const text = changeText(plan, fromRoute, byId) ?? { message: change.message, tradeOff: change.tradeOff };
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
    void speakChange(speechFor(plan, fromRoute, byId));
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
    const message = noticeText(notice, plan, useIncidents.getState().byId);
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
  const rec = recommendedRoute(trip.plan);
  if (!rec) return;
  const simTimeS = useSim.getState().simTimeS;
  trip.startTrip(startVehicle(rec.edgeIds), simTimeS);
  trip.dismissBanner();
  useActivity.getState().add({ atS: simTimeS, kind: 'trip', text: t('activityTripStarted', { name: routeName(rec.name) }) });
}

export function endTrip(): void {
  useTrip.getState().endTrip();
  schedulePlan({ delayMs: 0 });
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
