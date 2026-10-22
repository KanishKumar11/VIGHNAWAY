import type {
  Alert,
  Incident,
  LatLng,
  Place,
  PlanNotice,
  PlanResult,
  Reachable,
  RouteEvaluation,
  Text,
} from '@vighnaway/contracts';
import type { Evaluated } from './evaluate';
import { evaluate } from './evaluate';
import { counterfactuals } from './counterfactual';
import { describeChange, explain } from './explain';
import type { GEdge, Graph } from './graph';
import { nodePoint, snapToEdge, snapToNode } from './graph';
import type { EvalContext, IncidentIndex } from './incidents';
import { alertContext, buildIncidentIndex, incidentEffect } from './incidents';
import type { Path, WeightFn } from './paths';
import { baseTime, dijkstraIdx, overlapFraction, pathKey, penaltyAlternativesIdx, yenKShortestIdx } from './paths';
import { rank } from './rank';
import { SCORING_RULES } from './rules';
import { pointAlong } from './geo';
import { edgeCumulative } from './graph';
import { hashValue, stripText } from './hash';
import { hazardPhraseText, tx } from './text/build';
import { renderText } from './text/render';

export interface TripConditions {
  incidents: readonly Incident[];
  /** Simulation time, seconds. */
  nowS: number;
  alerts: readonly Alert[];
  hasAlertInformation: boolean;
}

export interface PlanTripInput extends TripConditions {
  graph: Graph;
  /** Node id or a point (snapped to the nearest usable node). */
  origin: string | LatLng;
  destination: string | LatLng;
  /** Route currently recommended or being followed, for the switching rule. */
  previousRecommendation?: { routeId: string; edgeIds: readonly string[] } | null;
  /** Places offered when no route to the destination is viable. */
  places?: readonly Place[];
  destinationPlaceId?: string | null;
}

export interface ReplanInput extends TripConditions {
  graph: Graph;
  destination: string | LatLng;
  /** Edge ids of the route being followed, including the edge the vehicle is on. */
  currentRoute: readonly string[];
  /** Vehicle on an edge (preferred), or a raw point that is snapped onto the current route. */
  vehicle: { edgeId: string; fraction: number } | { point: LatLng };
  places?: readonly Place[];
  destinationPlaceId?: string | null;
}

const rules = SCORING_RULES.candidates.value;

const crossingSignature = (ev: Evaluated): string =>
  ev.crossings
    .filter((c) => c.kind !== 'bridge')
    .map((c) => c.name)
    .join('>');

function resolveNode(graph: Graph, ref: string | LatLng): number | null {
  if (typeof ref === 'string') return graph.nodeIndex.get(ref) ?? null;
  const id = snapToNode(graph, ref);
  return id === null ? null : graph.nodeIndex.get(id) ?? null;
}

/** Travel-time multiplier on an edge from verified or corroborated congestion. */
export function edgeMultiplier(e: GEdge, index: IncidentIndex, ctx: EvalContext): number {
  let m = 1;
  for (const inc of index.openByEdge.get(e.baseId) ?? []) {
    const eff = incidentEffect(inc, ctx);
    if (eff.kind === 'congestion') m = Math.max(m, eff.multiplier);
  }
  return m;
}

/** Search weight that routes around hard blocks and leans away from penalties. */
export function awareWeight(graph: Graph, index: IncidentIndex, ctx: EvalContext): WeightFn {
  const cache = new Map<number, number>();
  return (e) => {
    const hit = cache.get(e.idx);
    if (hit !== undefined) return hit;
    let mult = 1;
    let extra = 0;
    for (const inc of index.openByEdge.get(e.baseId) ?? []) {
      const eff = incidentEffect(inc, ctx);
      if (eff.kind === 'block') {
        cache.set(e.idx, Infinity);
        return Infinity;
      }
      if (eff.kind === 'congestion') mult = Math.max(mult, eff.multiplier);
      const share = Math.max(1, Math.ceil(inc.edgeIds.length / 2));
      extra += eff.penaltyS / share + eff.unverifiedCongestionShare * e.timeS;
    }
    if (e.floodProne && ctx.rainAlertActive) {
      const last = index.lastReportByEdge.get(e.baseId);
      if (last === undefined || ctx.nowS - last > SCORING_RULES.dataGap.value.windowS) {
        extra += SCORING_RULES.dataGap.value.penaltyS;
      }
    }
    const w = e.timeS * mult + extra;
    cache.set(e.idx, w);
    return w;
  };
}

/** Base candidates depend only on the graph and endpoints, so they are memoised. */
const baseCandidateCache = new Map<string, Path[]>();
const BASE_CACHE_LIMIT = 64;

function baseCandidates(graph: Graph, from: number, to: number, banned: ReadonlySet<number>): Path[] {
  const key = `${graph.version}|${graph.profile}|${from}|${to}|${[...banned].sort((a, b) => a - b).join(',')}`;
  const hit = baseCandidateCache.get(key);
  if (hit) return hit;
  const yen = yenKShortestIdx(graph, from, to, rules.k, baseTime, {
    bannedEdges: banned,
    overlapLimit: rules.overlapLimit,
    maxSearches: 60,
  });
  const pen = penaltyAlternativesIdx(graph, from, to, rules.penaltyRounds, rules.penaltyFactor, baseTime, {
    bannedEdges: banned,
  });
  const list = [...yen, ...pen];
  if (baseCandidateCache.size >= BASE_CACHE_LIMIT) {
    const first = baseCandidateCache.keys().next().value;
    if (first !== undefined) baseCandidateCache.delete(first);
  }
  baseCandidateCache.set(key, list);
  return list;
}

function edgeIdxFromIds(graph: Graph, ids: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const id of ids) {
    const i = graph.edgeIndex.get(id);
    if (i === undefined) return null;
    out.push(i);
  }
  return out;
}

function isContiguous(graph: Graph, edges: readonly number[], from: number, to: number): boolean {
  if (!edges.length) return false;
  let cur = from;
  for (const ei of edges) {
    const e = graph.edges[ei]!;
    if (e.from !== cur) return false;
    cur = e.to;
  }
  return cur === to;
}

/** Nearest reachable place by ETA with a viable route, ties by place id. */
export function findReachableDestination(
  graph: Graph,
  origin: string | LatLng,
  places: readonly Place[],
  incidents: readonly Incident[] | IncidentIndex,
  ctx: EvalContext,
  options: { excludePlaceIds?: readonly string[]; kinds?: readonly Place['kind'][] } = {},
): Reachable | null {
  const from = resolveNode(graph, origin);
  if (from === null) return null;
  const index = 'sorted' in incidents ? incidents : buildIncidentIndex(incidents);
  const kinds = options.kinds ?? ['hospital', 'shelter'];
  const candidates = [...places]
    .filter((p) => kinds.includes(p.kind) && !(options.excludePlaceIds ?? []).includes(p.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const weight = awareWeight(graph, index, ctx);
  let best: Reachable | null = null;
  for (const place of candidates) {
    const to = graph.nodeIndex.get(place.nodeId);
    if (to === undefined) continue;
    const path = to === from ? null : dijkstraIdx(graph, from, to, weight);
    if (!path) continue;
    const ev = evaluate(graph, path.edges, index, ctx);
    if (!ev.viable) continue;
    if (!best || ev.etaS < best.etaS) {
      best = { placeId: place.id, placeName: place.name, etaS: ev.etaS, routeId: ev.routeId };
    }
  }
  return best;
}

interface CoreOptions {
  bannedEdges: ReadonlySet<number>;
  isReversal: boolean;
  previousEdges: number[] | null;
  places: readonly Place[];
  destinationPlaceId: string | null;
}

function planCore(
  graph: Graph,
  from: number,
  to: number,
  index: IncidentIndex,
  ctx: EvalContext,
  opts: CoreOptions,
): Omit<PlanResult, 'leadInS' | 'vehicle' | 'isReversal'> {
  const paths: Path[] = [];
  const seen = new Set<string>();
  const add = (p: Path | null) => {
    if (!p || !p.edges.length) return;
    const key = pathKey(graph, p);
    if (seen.has(key)) return;
    seen.add(key);
    paths.push(p);
  };

  const base = baseCandidates(graph, from, to, opts.bannedEdges);
  const usualFastestPath = base[0] ?? null;
  for (const p of base) add(p);
  const aware = awareWeight(graph, index, ctx);
  add(dijkstraIdx(graph, from, to, aware, { bannedEdges: opts.bannedEdges }));
  if (index.sorted.length) {
    for (const p of penaltyAlternativesIdx(graph, from, to, 2, rules.penaltyFactor, aware, { bannedEdges: opts.bannedEdges })) add(p);
  }
  let previousKey: string | null = null;
  if (opts.previousEdges && isContiguous(graph, opts.previousEdges, from, to)) {
    const prev: Path = { nodes: [], edges: opts.previousEdges, weight: 0 };
    previousKey = pathKey(graph, prev);
    add(prev);
  }

  const evaluations = paths.map((p) => evaluate(graph, p.edges, index, ctx));
  const byId = new Map(evaluations.map((e) => [e.routeId, e] as const));
  const usualFastestId = usualFastestPath ? pathKey(graph, usualFastestPath) : null;
  const ranked = rank(evaluations, previousKey, { usualFastestRouteId: usualFastestId, incidents: index.byId });
  const recommended = ranked.recommendedRouteId ? byId.get(ranked.recommendedRouteId)! : null;
  const usualFastest = usualFastestId ? byId.get(usualFastestId) ?? null : null;
  const previous = previousKey ? byId.get(previousKey) ?? null : null;

  // Display set: recommended, usual fastest, previous, then the rest in rank order, dropping a
  // route that shares more than 80% of its length with one already shown.
  const shown: Evaluated[] = [];
  const pathOf = (ev: Evaluated): Path => ({ nodes: [], edges: ev.edgeIds.map((id) => graph.edgeIndex.get(id)!), weight: 0 });
  const pushShown = (ev: Evaluated | null, force: boolean) => {
    if (!ev || shown.some((s) => s.routeId === ev.routeId)) return;
    if (!force && shown.length >= rules.maxDisplayed) return;
    if (!force && shown.some((s) => overlapFraction(graph, pathOf(ev), pathOf(s)) > rules.overlapLimit)) return;
    // Prefer routes through different crossings: two routes over the same crossing read as one.
    const sig = crossingSignature(ev);
    if (!force && sig && shown.some((s) => crossingSignature(s) === sig)) return;
    // Two routes with the same title cannot be told apart in the list, so the later one is dropped.
    if (!force && shown.some((s) => s.name === ev.name)) return;
    shown.push(ev);
  };
  pushShown(recommended, true);
  pushShown(usualFastest, true);
  pushShown(previous, true);
  for (const ev of ranked.ordered) pushShown(ev, false);

  const keptDespiteGainS = ranked.decision.kind === 'kept' ? ranked.decision.gainS : null;
  const explainCtx = {
    incidents: index.byId,
    usualFastest,
    recommended,
    hasAlertInformation: ctx.hasAlertInformation,
    rainAlertActive: ctx.rainAlertActive,
    isReversal: opts.isReversal,
    keptDespiteGainS,
  };

  const cfs = recommended
    ? counterfactuals({
        graph,
        candidates: evaluations,
        recommendedRouteId: recommended.routeId,
        index,
        ctx,
        previousKey,
        usualFastestRouteId: usualFastestId,
        targets: shown,
      })
    : new Map();

  const roleOrder = { recommended: 0, usual_fastest: 1, alternative: 2, blocked: 3 } as const;
  const routes: RouteEvaluation[] = shown
    .map((ev) => {
      const role = ranked.roles.get(ev.routeId) ?? 'alternative';
      const explanation = explain(ev, shown, {
        ...explainCtx,
        isReversal: opts.isReversal && role === 'recommended',
      });
      const cf = cfs.get(ev.routeId);
      return { ...ev, role, explanation, ...(cf ? { counterfactual: cf.counterfactual, counterfactualText: cf.text } : {}) };
    })
    .sort((a, b) => {
      const r = roleOrder[a.role] - roleOrder[b.role];
      if (r !== 0) return r;
      if (a.costS !== b.costS) return a.costS - b.costS;
      if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
      return a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0;
    });

  const change = describeChange(ranked.decision, recommended, previous);
  const notices: PlanNotice[] = [];
  if (ranked.decision.kind === 'kept' && recommended) {
    const active = recommended.hazards.filter((h) => h.effect !== 'none');
    if (active.length) {
      const unverified = active.filter((h) => h.status === 'unverified').length;
      const first = index.byId.get(active[0]!.incidentId);
      const messageText =
        unverified === active.length
          ? unverified === 1
            ? tx('notice.unchanged.one')
            : tx('notice.unchanged.many', { n: unverified })
          : tx('notice.unchanged.hazard', { hazard: first ? hazardPhraseText(first) : tx('hazards.unknown') });
      notices.push(notice('unchanged_with_hazard', messageText));
    }
  }

  const noViableRoute = recommended === null;
  let reachable: Reachable | null = null;
  if (noViableRoute) {
    notices.push(notice('no_viable_route', tx('notice.noViable')));
    reachable = findReachableDestination(graph, graph.nodeIds[from]!, opts.places, index, ctx, {
      excludePlaceIds: opts.destinationPlaceId ? [opts.destinationPlaceId] : [],
    });
  }

  return {
    graphVersion: graph.version,
    profile: graph.profile,
    evaluatedAtS: ctx.nowS,
    originNodeId: graph.nodeIds[from]!,
    destinationNodeId: graph.nodeIds[to]!,
    incidentCount: index.sorted.length,
    routes,
    recommendedRouteId: recommended?.routeId ?? null,
    usualFastestRouteId: usualFastestId,
    change,
    notices,
    noViableRoute,
    reachable,
  };
}

function emptyPlan(graph: Graph, ctx: EvalContext, index: IncidentIndex, from: number | null, to: number | null): PlanResult {
  return {
    graphVersion: graph.version,
    profile: graph.profile,
    evaluatedAtS: ctx.nowS,
    originNodeId: from === null ? '' : graph.nodeIds[from]!,
    destinationNodeId: to === null ? '' : graph.nodeIds[to]!,
    incidentCount: index.sorted.length,
    routes: [],
    recommendedRouteId: null,
    usualFastestRouteId: null,
    change: null,
    notices: [notice('no_viable_route', tx('notice.noRoute'))],
    noViableRoute: true,
    reachable: null,
    isReversal: false,
    leadInS: 0,
    vehicle: null,
  };
}

const notice = (kind: PlanNotice['kind'], messageText: Text): PlanNotice => ({
  kind,
  message: renderText(messageText, 'en'),
  messageText,
});

const planMemo = new Map<string, PlanResult>();
const PLAN_MEMO_LIMIT = 32;

function memoKey(parts: unknown[]): string {
  return hashValue(parts);
}

/** Plans a trip: candidates, evaluation, ranking with the switching rule, explanations. */
export function planTrip(input: PlanTripInput): PlanResult {
  const { graph } = input;
  const index = buildIncidentIndex(input.incidents);
  const ctx = alertContext(input.alerts, input.hasAlertInformation, input.nowS);
  const from = resolveNode(graph, input.origin);
  const to = resolveNode(graph, input.destination);
  const key = memoKey([
    'plan',
    graph.version,
    graph.profile,
    from,
    to,
    index.fingerprint,
    ctx,
    input.previousRecommendation?.routeId ?? null,
    input.destinationPlaceId ?? null,
    (input.places ?? []).map((p) => p.id),
  ]);
  const hit = planMemo.get(key);
  if (hit) return hit;

  let result: PlanResult;
  if (from === null || to === null || from === to) {
    result = emptyPlan(graph, ctx, index, from, to);
  } else {
    const prevEdges = input.previousRecommendation ? edgeIdxFromIds(graph, input.previousRecommendation.edgeIds) : null;
    const core = planCore(graph, from, to, index, ctx, {
      bannedEdges: new Set(),
      isReversal: false,
      previousEdges: prevEdges,
      places: input.places ?? [],
      destinationPlaceId: input.destinationPlaceId ?? null,
    });
    result = { ...core, isReversal: false, leadInS: 0, vehicle: null };
  }
  if (planMemo.size >= PLAN_MEMO_LIMIT) {
    const first = planMemo.keys().next().value;
    if (first !== undefined) planMemo.delete(first);
  }
  planMemo.set(key, result);
  return result;
}

/**
 * Re-plans en route. The vehicle is snapped to its current edge and planning starts from that
 * edge's end node; turning back onto the reverse of the current edge is banned while any forward
 * plan is viable. Only when none is, a reversal is returned with the reversal label and
 * confidence Low.
 */
export function replanFrom(input: ReplanInput): PlanResult {
  const { graph } = input;
  const index = buildIncidentIndex(input.incidents);
  const ctx = alertContext(input.alerts, input.hasAlertInformation, input.nowS);
  const to = resolveNode(graph, input.destination);

  let edgeId: string | null;
  let fraction: number;
  if ('edgeId' in input.vehicle) {
    edgeId = input.vehicle.edgeId;
    fraction = input.vehicle.fraction;
  } else {
    const snap = snapToEdge(graph, input.vehicle.point, input.currentRoute);
    edgeId = snap?.edgeId ?? null;
    fraction = snap?.fraction ?? 0;
  }
  fraction = Math.max(0, Math.min(1, fraction));
  const ei = edgeId === null ? undefined : graph.edgeIndex.get(edgeId);
  if (ei === undefined || to === null) return emptyPlan(graph, ctx, index, null, to);
  const e = graph.edges[ei]!;
  const pos = pointAlong(e.geometry, edgeCumulative(e), fraction);
  const vehicle = { edgeId: e.id, point: pos.point, headingDeg: Math.round(pos.headingDeg) };

  const routeIdx = input.currentRoute.indexOf(e.id);
  const remainingIds = routeIdx >= 0 ? input.currentRoute.slice(routeIdx + 1) : [];
  const remaining = edgeIdxFromIds(graph, remainingIds);
  const leadInS = Math.round((1 - fraction) * e.timeS * edgeMultiplier(e, index, ctx));
  const onCurrentEdge = (index.openByEdge.get(e.baseId) ?? []).filter((inc) => incidentEffect(inc, ctx).kind === 'block');

  const finish = (core: Omit<PlanResult, 'leadInS' | 'vehicle' | 'isReversal'>, isReversal: boolean, lead: number): PlanResult => {
    const notices = [...core.notices];
    if (onCurrentEdge.length) {
      notices.unshift(notice('on_blocked_edge', tx('notice.onBlocked', { hazard: hazardPhraseText(onCurrentEdge[0]!) })));
    }
    if (isReversal) notices.unshift(notice('reversal', tx('reversal')));
    return { ...core, notices, isReversal, leadInS: lead, vehicle };
  };

  if (e.to === to) {
    const arrived = emptyPlan(graph, ctx, index, e.to, to);
    return { ...arrived, notices: [], noViableRoute: false, leadInS, vehicle };
  }

  const banned = new Set<number>();
  if (e.reverseIdx >= 0) banned.add(e.reverseIdx);
  const forward = planCore(graph, e.to, to, index, ctx, {
    bannedEdges: banned,
    isReversal: false,
    previousEdges: remaining && remaining.length ? remaining : null,
    places: input.places ?? [],
    destinationPlaceId: input.destinationPlaceId ?? null,
  });
  if (!forward.noViableRoute || e.reverseIdx < 0) return finish(forward, false, leadInS);

  // No forward plan is viable: consider turning back along the current edge.
  const reverse = graph.edges[e.reverseIdx]!;
  const back = planCore(graph, reverse.to, to, index, ctx, {
    bannedEdges: new Set([e.idx]),
    isReversal: true,
    previousEdges: null,
    places: input.places ?? [],
    destinationPlaceId: input.destinationPlaceId ?? null,
  });
  if (back.noViableRoute) return finish(forward, false, leadInS);
  // The vehicle first turns back along `reverse`; followedRoute() prepends it for the simulator.
  const lead = Math.round(fraction * reverse.timeS * edgeMultiplier(reverse, index, ctx));
  const fwd = forward.change;
  // The forward plan found nothing viable, so its message reads "No viable route. <cause>": reuse the cause.
  const cause = fwd?.messageText?.params?.cause;
  const base = !fwd
    ? tx('change.changed')
    : fwd.kind === 'no_viable_route'
      ? cause
        ? tx('change.changed.cause', { cause })
        : tx('change.changed')
      : fwd.messageText ?? tx('change.changed');
  const messageText = tx('change.reversal', { base, reversal: tx('reversal') });
  const change = {
    fromRouteId: fwd?.fromRouteId ?? null,
    toRouteId: back.recommendedRouteId,
    kind: 'invalid' as const,
    trigger: fwd?.trigger ?? null,
    gainS: null,
    message: renderText(messageText, 'en'),
    tradeOff: '',
    messageText,
  };
  return finish({ ...back, change }, true, lead);
}

/** Hash of a plan, for the phone and console parity check. */
export const planHash = (plan: PlanResult): string => hashValue(stripText(plan));

/** Node position helper for markers. */
export const nodeLatLng = (graph: Graph, nodeId: string): LatLng | null => {
  const i = graph.nodeIndex.get(nodeId);
  return i === undefined ? null : nodePoint(graph, i);
};
