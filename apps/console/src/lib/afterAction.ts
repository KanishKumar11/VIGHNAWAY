import type { HistoryEntry, HistoryResponse, Text } from '@vighnaway/contracts';
import { formatSimClock, incidentsAtSeq } from '@vighnaway/contracts';
import { ENGINE_VERSION, rulesHash } from '@vighnaway/engine';
import { createTrip, incidentsTrip, recommendedRoute, tickTrip, type TripEnv } from './demoTrip';
import { makeReceipt } from './receipt';
import { replayMoments } from './replay';

/**
 * After-action report (docs/TASKS.md P2-1). Built from the run's recorded history alone: the engine
 * is deterministic, so feeding the history through the same trip steps as the live console gives
 * the decision at every moment. Pure; the page fetches `/history` and passes it in. Figures are
 * modelled minutes in a simulated scenario, compared with the usual fastest route under the same
 * reports; nothing here claims a real-world outcome.
 */

export interface RouteFigure {
  name: string;
  nameText?: Text;
  etaS: number;
  confidence: 'high' | 'medium' | 'low';
  /** Reported hazards that affect this route (warnings, hard blocks, congestion). */
  hazards: number;
  /** Hard blocks on it (Corroborated or Verified, or stale). */
  blocks: number;
}

export interface Moment {
  seq: number;
  atS: number;
  clock: string;
  /** The history entries recorded at this moment, oldest first. */
  entries: HistoryEntry[];
  /** True when an operator set Verified, Resolved or Dismissed in this moment. */
  operator: boolean;
  recommended: RouteFigure | null;
  usualFastest: RouteFigure | null;
  /** The engine's sentence when the recommendation changed here (route or destination). */
  change: { message: string; messageText?: Text; kind: string } | null;
  destinationId: string;
  /** Receipt token: /verify?r=<token> re-runs this decision. */
  receipt: string;
}

export interface AfterAction {
  scenarioId: string;
  scenarioName: string;
  simulated: boolean;
  runId: string;
  graphVersion: string;
  rulesHash: string;
  engineVersion: string;
  moments: Moment[];
  summary: {
    incidents: number;
    reports: number;
    operatorActions: number;
    routeChanges: number;
    destinationSwitches: number;
    /** Modelled minutes the final recommendation takes beyond the usual route (0 when it is not slower). */
    extraMin: number;
    /** The usual fastest route stands on a hard block at the end. */
    usualBlockedAtEnd: boolean;
    usualHazardsAtEnd: number;
    recommendedHazardsAtEnd: number;
    noViableRouteAtEnd: boolean;
    startDestinationId: string;
    endDestinationId: string;
  };
}

const OPERATOR_KINDS = new Set(['verified', 'resolved', 'dismissed']);

function figure(route: ReturnType<typeof recommendedRoute>): RouteFigure | null {
  if (!route) return null;
  return {
    name: route.name,
    nameText: route.nameText,
    etaS: route.etaS,
    confidence: route.explanation.confidence,
    hazards: route.hazards.filter((h) => h.effect !== 'none').length,
    blocks: route.blockedBy.length,
  };
}

export function buildAfterAction(env: TripEnv, history: HistoryResponse): AfterAction {
  const { scenario } = env;
  const entries = history.entries;
  let trip = createTrip(env, [], 0);
  const startDestinationId = trip.destinationId;
  const moments: Moment[] = [];
  let prevSeq = 0;
  let prevChangeCount = 0;
  let destinationSwitches = 0;
  let routeChanges = 0;
  let incidents = incidentsAtSeq(entries, 0);

  for (const m of replayMoments(entries)) {
    const before = trip.destinationId;
    trip = tickTrip(env, trip, m.atS, incidents);
    incidents = incidentsAtSeq(entries, m.seq);
    trip = incidentsTrip(env, trip, incidents, m.atS);
    const here = entries.filter((e) => e.seq > prevSeq && e.seq <= m.seq);
    prevSeq = m.seq;
    const changed = trip.changeCount > prevChangeCount ? trip.change : null;
    prevChangeCount = trip.changeCount;
    if (changed) {
      if (changed.kind === 'destination') destinationSwitches++;
      else routeChanges++;
    } else if (trip.destinationId !== before) {
      destinationSwitches++;
    }
    const plan = trip.plan;
    moments.push({
      seq: m.seq,
      atS: m.atS,
      clock: formatSimClock(scenario.clockStartsAt, m.atS, true),
      entries: here,
      operator: here.some((e) => OPERATOR_KINDS.has(e.kind)),
      recommended: figure(recommendedRoute(plan)),
      usualFastest: figure(plan.routes.find((r) => r.routeId === plan.usualFastestRouteId) ?? null),
      change: changed ? { message: changed.message, messageText: changed.messageText, kind: changed.kind } : null,
      destinationId: trip.destinationId,
      receipt: makeReceipt(scenario, incidents, m.seq, m.atS, trip.destinationId).token,
    });
  }

  const last = moments[moments.length - 1];
  const finalPlan = trip.plan;
  const recFinal = recommendedRoute(finalPlan);
  const usualFinal = finalPlan.routes.find((r) => r.routeId === finalPlan.usualFastestRouteId) ?? null;
  const ids = new Set(entries.map((e) => e.incident.id));
  const opActions = entries.filter((e) => OPERATOR_KINDS.has(e.kind)).length;
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    simulated: scenario.mode !== 'live',
    runId: history.runId,
    graphVersion: env.graph.version,
    rulesHash: rulesHash(),
    engineVersion: ENGINE_VERSION,
    moments,
    summary: {
      incidents: ids.size,
      // Each history entry is one report or operator action on an incident; operator actions are counted separately.
      reports: entries.length - opActions,
      operatorActions: opActions,
      routeChanges,
      destinationSwitches,
      extraMin: recFinal && usualFinal ? Math.round(Math.max(0, recFinal.etaS - usualFinal.etaS) / 6) / 10 : 0,
      usualBlockedAtEnd: !!usualFinal && !usualFinal.viable,
      usualHazardsAtEnd: usualFinal ? usualFinal.hazards.filter((h) => h.effect !== 'none').length : 0,
      recommendedHazardsAtEnd: recFinal ? recFinal.hazards.filter((h) => h.effect !== 'none').length : 0,
      noViableRouteAtEnd: finalPlan.noViableRoute,
      startDestinationId,
      endDestinationId: last ? last.destinationId : startDestinationId,
    },
  };
}
