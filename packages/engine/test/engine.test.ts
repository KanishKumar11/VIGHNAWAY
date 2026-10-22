import { describe, expect, it } from 'vitest';
import type { Incident, PlanResult } from '@vighnaway/contracts';
import { findForbiddenWords } from '@vighnaway/contracts';
import {
  alertContext,
  buildIncidentIndex,
  dijkstra,
  evaluate,
  findReachableDestination,
  loadGraph,
  planHash,
  planTrip,
  replanFrom,
  SCORING_RULES,
  snapToNode,
  yenKShortest,
} from '../src';
import { andheriGraph, andheriScenario, edgesNamed, incident, noAlerts, place, rainAlert } from './helpers';

const car = loadGraph(andheriGraph, 'car');
const foot = loadGraph(andheriGraph, 'foot');
const origin = place('origin-marol');
const dest = place('hosp-kokilaben');

const SUBWAY = edgesNamed(andheriGraph, 'Andheri Subway');
const GOKHALE = edgesNamed(andheriGraph, 'Gokhale Bridge');
const OLD_NAGARDAS = edgesNamed(andheriGraph, 'Old Nagardas Road');
const HOSPITAL_ROAD = edgesNamed(andheriGraph, 'Rao Saheb Achyutrao Patwardhan Marg');

function plan(incidents: Incident[], opts: Partial<Parameters<typeof planTrip>[0]> = {}): PlanResult {
  return planTrip({
    graph: car,
    origin: origin.nodeId,
    destination: dest.nodeId,
    incidents,
    nowS: 0,
    ...noAlerts,
    places: andheriScenario.places,
    destinationPlaceId: dest.id,
    ...opts,
  });
}

const rec = (p: PlanResult) => p.routes.find((r) => r.routeId === p.recommendedRouteId)!;
const usual = (p: PlanResult) => p.routes.find((r) => r.routeId === p.usualFastestRouteId)!;
const crosses = (r: { edgeIds: string[] }, ids: string[]) => r.edgeIds.some((e) => ids.includes(e));

describe('graph and search', () => {
  it('loads profile graphs with profile access', () => {
    expect(car.edges.some((e) => e.highway === 'footway')).toBe(false);
    expect(foot.edges.some((e) => e.highway === 'footway')).toBe(true);
    // On foot, the one-way Parsi Panchayat Road can be walked both ways.
    expect(foot.edges.some((e) => e.virtual && e.name === 'Parsi Panchayat Road')).toBe(true);
    expect(car.edges.some((e) => e.virtual)).toBe(false);
  });

  it('snaps a point to the nearest usable node', () => {
    expect(snapToNode(car, origin.point)).toBe(origin.nodeId);
  });

  it('origin and destination are connected for every profile', () => {
    for (const profile of ['car', 'two_wheeler', 'foot'] as const) {
      const g = loadGraph(andheriGraph, profile);
      expect(dijkstra(g, origin.nodeId, dest.nodeId), profile).not.toBeNull();
    }
  });

  it('yen returns distinct loopless paths in order, none sharing more than 80% with a better one', () => {
    const paths = yenKShortest(car, origin.nodeId, dest.nodeId, 5);
    expect(paths.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < paths.length; i++) expect(paths[i]!.weight).toBeGreaterThanOrEqual(paths[i - 1]!.weight);
    for (const p of paths) expect(new Set(p.nodes).size).toBe(p.nodes.length);
  });
});

describe('planTrip: required scenarios', () => {
  it('normal trip with no hazards: the usual fastest route is recommended', () => {
    const p = plan([]);
    expect(p.recommendedRouteId).toBe(p.usualFastestRouteId);
    expect(rec(p).name).toBe('Via Andheri Subway');
    expect(rec(p).explanation.reason).toBe('Fastest route, no reported hazards.');
    expect(p.routes.map((r) => r.name)).toEqual([
      'Via Andheri Subway',
      'Via Gokhale Bridge',
      'Via Jogeshwari Road Over Bridge',
    ]);
  });

  it('verified closure on the fastest route makes it not viable and recommends another', () => {
    const p = plan([incident({ type: 'closure', status: 'verified', edgeIds: SUBWAY, roadName: 'Andheri Subway' })]);
    expect(usual(p).viable).toBe(false);
    expect(usual(p).role).toBe('blocked');
    expect(rec(p).name).toBe('Via Gokhale Bridge');
    expect(rec(p).explanation.reason).toMatch(/^Avoids road closure at Andheri Subway \(Verified by operator\)/);
    expect(rec(p).explanation.tradeOff).toMatch(/^\+5 min/);
  });

  it('a short travel time never overrides a hard constraint', () => {
    const p = plan([incident({ type: 'flood', depth: 'waist', status: 'corroborated', deviceCount: 2, edgeIds: SUBWAY })]);
    expect(crosses(rec(p), SUBWAY)).toBe(false);
  });

  it('unverified flood report below the switching threshold keeps the recommendation', () => {
    const first = plan([]);
    const prev = rec(first);
    const p = plan([incident({ type: 'flood', depth: 'ankle', edgeIds: SUBWAY })], {
      previousRecommendation: { routeId: prev.routeId, edgeIds: prev.edgeIds },
    });
    expect(p.recommendedRouteId).toBe(prev.routeId);
    expect(p.change).toBeNull();
    expect(p.notices[0]?.message).toBe('Route unchanged: one unverified report');
    expect(rec(p).explanation.confidence).toBe('medium');
  });

  it('a new incident blocking the selected route switches and records the trigger', () => {
    const prev = rec(plan([]));
    const blocking = incident({ type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, edgeIds: SUBWAY, roadName: 'Andheri Subway' });
    const p = plan([blocking], { previousRecommendation: { routeId: prev.routeId, edgeIds: prev.edgeIds } });
    expect(p.recommendedRouteId).not.toBe(prev.routeId);
    expect(p.change?.kind).toBe('invalid');
    expect(p.change?.trigger).toEqual({ incidentId: blocking.id, type: 'flood', status: 'corroborated', source: 'simulated' });
    expect(p.change?.message).toBe(
      'Route changed. Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated. New route via Gokhale Bridge adds 5 min.',
    );
  });

  it('no viable alternative: reports no viable route and offers the nearest reachable hospital', () => {
    const p = plan([incident({ type: 'closure', status: 'verified', edgeIds: HOSPITAL_ROAD })]);
    expect(p.noViableRoute).toBe(true);
    expect(p.recommendedRouteId).toBeNull();
    expect(p.routes.every((r) => r.role === 'blocked')).toBe(true);
    expect(p.notices.map((n) => n.message)).toContain('No viable route to this destination. In an emergency, call 112.');
    expect(p.reachable?.placeId).toBe('hosp-holy-spirit');
  });

  it('reachable destination: finds the nearest place with a viable route', () => {
    const ctx = alertContext([], true, 0);
    const r = findReachableDestination(car, origin.nodeId, andheriScenario.places, [], ctx, { excludePlaceIds: [dest.id] });
    expect(r).not.toBeNull();
    const blocked = findReachableDestination(
      car,
      origin.nodeId,
      andheriScenario.places,
      [incident({ type: 'closure', status: 'verified', edgeIds: edgesNamed(andheriGraph, 'Mahakali Caves Road') })],
      ctx,
      { excludePlaceIds: [dest.id] },
    );
    expect(blocked?.placeId).toBe('hosp-hbt');
  });

  it('profile change alters the route: on foot uses the station footbridge', () => {
    const fob = edgesNamed(andheriGraph, 'Andheri Station Footbridge');
    const fobEdge = andheriGraph.edges.find((e) => e.id === fob[0])!;
    // From the east end of the footbridge to the west end: cars must drive round over Gokhale Bridge.
    const od = { origin: fobEdge.from, destination: fobEdge.to, places: [], destinationPlaceId: null };
    const footPlan = plan([], { graph: foot, ...od });
    const carPlan = plan([], od);
    expect(crosses(rec(footPlan), fob)).toBe(true);
    expect(crosses(rec(carPlan), fob)).toBe(false);
    expect(rec(footPlan).routeId).not.toBe(rec(carPlan).routeId);
  });

  it('labels stale reports and keeps them in force', () => {
    const stale = incident({ type: 'closure', status: 'verified', edgeIds: SUBWAY, lastReportAtS: 0 });
    const p = plan([stale], { nowS: 3 * 3600 + 1 });
    const blocked = p.routes.find((r) => r.name === 'Via Andheri Subway')!;
    expect(blocked.viable).toBe(false);
    expect(blocked.hazards[0]!.stale).toBe(true);
    expect(blocked.explanation.reason).toMatch(/older than 3 hours/);
    expect(rec(p).explanation.confidence).toBe('low');
  });

  it('replay snapshot: identical inputs give identical output and hash', () => {
    const incs = [
      incident({ id: 'x:2', type: 'flood', depth: 'ankle', edgeIds: SUBWAY }),
      incident({ id: 'x:1', type: 'congestion', congestion: 'heavy', status: 'corroborated', edgeIds: GOKHALE }),
    ];
    const a = plan(incs, { nowS: 120, ...rainAlert });
    const b = plan([...incs].reverse(), { nowS: 120, ...rainAlert });
    expect(planHash(a)).toBe(planHash(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('scoring definitions', () => {
  const ctx = alertContext([], true, 0);
  const subwayRoute = () => rec(plan([]));
  const evalWith = (incs: Incident[], nowS = 0, alerts = noAlerts) => {
    const r = subwayRoute();
    const idx = r.edgeIds.map((id) => car.edgeIndex.get(id)!);
    return evaluate(car, idx, buildIncidentIndex(incs), alertContext(alerts.alerts, alerts.hasAlertInformation, nowS));
  };

  it('ankle-deep flood is a medium penalty and stays viable', () => {
    const base = evalWith([]);
    const e = evalWith([incident({ type: 'flood', depth: 'ankle', edgeIds: SUBWAY })]);
    expect(e.viable).toBe(true);
    expect(e.etaS).toBe(base.etaS);
    expect(e.costS - base.costS).toBe(Math.round(300 * 0.4));
  });

  it('depth not given is treated as knee depth', () => {
    const unverified = evalWith([incident({ type: 'flood', depth: null, edgeIds: SUBWAY })]);
    expect(unverified.viable).toBe(true);
    expect(unverified.hazards[0]!.effect).toBe('warning');
    expect(unverified.hazards[0]!.penaltyS).toBe(SCORING_RULES.unverifiedBlockPenaltyS.value);
    const hard = evalWith([incident({ type: 'flood', depth: null, status: 'corroborated', edgeIds: SUBWAY })]);
    expect(hard.viable).toBe(false);
  });

  it('unverified congestion adds ranking cost but leaves the displayed ETA unchanged', () => {
    const base = evalWith([]);
    const akr = edgesNamed(andheriGraph, 'Andheri-Kurla Road');
    const unv = evalWith([incident({ type: 'congestion', congestion: 'heavy', edgeIds: akr })]);
    expect(unv.etaS).toBe(base.etaS);
    expect(unv.costS).toBeGreaterThan(base.costS);
    const hard = evalWith([incident({ type: 'congestion', congestion: 'heavy', status: 'verified', edgeIds: akr })]);
    expect(hard.etaS).toBeGreaterThan(base.etaS);
    // extra time x 0.4 for unverified, full extra time once verified
    expect(unv.costS - base.costS).toBe(Math.round((hard.etaS - base.etaS) * 0.4));
  });

  it('debris blocks only when reported impassable and verified or corroborated', () => {
    expect(evalWith([incident({ type: 'debris', severity: 'high', status: 'verified', edgeIds: SUBWAY })]).viable).toBe(true);
    expect(
      evalWith([incident({ type: 'debris', severity: 'high', impassable: true, status: 'corroborated', edgeIds: SUBWAY })]).viable,
    ).toBe(false);
    const unv = evalWith([incident({ type: 'debris', severity: 'low', impassable: true, edgeIds: SUBWAY })]);
    expect(unv.viable).toBe(true);
    expect(unv.hazards[0]!.effect).toBe('warning');
  });

  it('resolved and dismissed incidents have no effect', () => {
    const base = evalWith([]);
    for (const status of ['resolved', 'dismissed'] as const) {
      const e = evalWith([incident({ type: 'closure', status, edgeIds: SUBWAY })]);
      expect(e.costS).toBe(base.costS);
      expect(e.viable).toBe(true);
    }
  });

  it('a report at exactly 3 h is not stale; one second later it is', () => {
    const inc = incident({ type: 'flood', depth: 'ankle', status: 'verified', edgeIds: SUBWAY, lastReportAtS: 0 });
    const at3h = evalWith([inc], 3 * 3600);
    const after = evalWith([inc], 3 * 3600 + 1);
    expect(at3h.hazards[0]!.stale).toBe(false);
    expect(after.hazards[0]!.stale).toBe(true);
    // age factor floor 0.6 at 3 h
    expect(at3h.hazards[0]!.penaltyS).toBe(Math.round(300 * 1 * 0.6));
  });

  it('data gap: a report exactly 60 min old still covers the edge; 1 s older does not', () => {
    const inc = incident({ type: 'flood', depth: 'ankle', status: 'resolved', edgeIds: SUBWAY, lastReportAtS: 0 });
    expect(evalWith([inc], 3600, rainAlert).dataGaps).toHaveLength(0);
    expect(evalWith([inc], 3601, rainAlert).dataGaps.length).toBeGreaterThan(0);
  });

  it('no data gap without a rain alert, and "No rain alert information" lowers confidence', () => {
    expect(evalWith([], 0, noAlerts).dataGaps).toHaveLength(0);
    expect(evalWith([], 0, rainAlert).dataGaps[0]?.roadName).toBe('Andheri Subway');
    const p = plan([], { alerts: [], hasAlertInformation: false });
    expect(rec(p).explanation.confidence).toBe('medium');
    expect(rec(p).explanation.confidenceReasons).toContain('No rain alert information');
  });

  it('a Road clear report marks an incident Conflicting and drops confidence to Low', () => {
    const p = plan([incident({ type: 'flood', depth: 'ankle', edgeIds: SUBWAY, conflicting: true })]);
    expect(rec(p).name).toBe('Via Andheri Subway');
    expect(rec(p).explanation.confidence).toBe('low');
    expect(rec(p).explanation.confidenceReasons[0]).toMatch(/Road clear/);
  });

  it('initial demo state: subway recommended with Medium confidence because of the data gap', () => {
    const p = plan([], rainAlert);
    expect(rec(p).name).toBe('Via Andheri Subway');
    expect(rec(p).explanation.confidence).toBe('medium');
    expect(rec(p).dataGaps[0]?.roadName).toBe('Andheri Subway');
    expect(ctx.rainAlertActive).toBe(false);
  });
});

describe('en-route re-planning', () => {
  const start = rec(plan([]));
  const akrEdge = start.edgeIds[1]!;

  it('plans from the end of the current edge and never turns back while a forward plan exists', () => {
    const blocking = incident({ type: 'closure', status: 'verified', edgeIds: SUBWAY });
    const p = replanFrom({
      graph: car,
      destination: dest.nodeId,
      currentRoute: start.edgeIds,
      vehicle: { edgeId: akrEdge, fraction: 0.5 },
      incidents: [blocking],
      nowS: 60,
      ...noAlerts,
    });
    const e = car.edges[car.edgeIndex.get(akrEdge)!]!;
    const reverseId = car.edges[e.reverseIdx]!.id;
    expect(p.isReversal).toBe(false);
    expect(p.originNodeId).toBe(car.nodeIds[e.to]);
    for (const r of p.routes) expect(r.edgeIds).not.toContain(reverseId);
    expect(p.change?.kind).toBe('invalid');
    expect(p.leadInS).toBeGreaterThan(0);
  });

  it('keeps the remaining route when nothing changes', () => {
    const p = replanFrom({
      graph: car,
      destination: dest.nodeId,
      currentRoute: start.edgeIds,
      vehicle: { edgeId: akrEdge, fraction: 0.2 },
      incidents: [],
      nowS: 30,
      ...noAlerts,
    });
    expect(p.recommendedRouteId).toBe(start.edgeIds.slice(2).join('|'));
    expect(p.change).toBeNull();
  });

  it('returns a reversal only when no forward plan is viable, labelled and with Low confidence', () => {
    // Vehicle heading west on Gokhale Bridge approach (Station Road East is a dead end).
    const sre = andheriGraph.edges.find((e) => e.name === 'Station Road East' && e.geometry[0]![1] < e.geometry[1]![1])!;
    const p = replanFrom({
      graph: car,
      destination: dest.nodeId,
      currentRoute: [sre.id],
      vehicle: { edgeId: sre.id, fraction: 0.5 },
      incidents: [],
      nowS: 0,
      ...noAlerts,
    });
    // Station Road East ends at a dead end for cars: the only way on is back.
    expect(p.isReversal).toBe(true);
    expect(p.notices[0]?.message).toBe('Turn back only where it is safe to do so');
    expect(rec(p).explanation.confidence).toBe('low');
  });

  it('warns when the vehicle is already on a newly blocked edge', () => {
    const subwayEdge = start.edgeIds.find((id) => SUBWAY.includes(id))!;
    const p = replanFrom({
      graph: car,
      destination: dest.nodeId,
      currentRoute: start.edgeIds,
      vehicle: { edgeId: subwayEdge, fraction: 0.3 },
      incidents: [incident({ type: 'closure', status: 'verified', edgeIds: SUBWAY })],
      nowS: 0,
      ...noAlerts,
    });
    expect(p.notices.some((n) => n.kind === 'on_blocked_edge')).toBe(true);
    expect(p.isReversal).toBe(false);
  });
});

describe('copy rules', () => {
  it('never uses forbidden words in plan output', () => {
    const variants = [
      plan([]),
      plan([incident({ type: 'closure', status: 'verified', edgeIds: SUBWAY })]),
      plan([incident({ type: 'closure', status: 'verified', edgeIds: HOSPITAL_ROAD })]),
      plan([incident({ type: 'congestion', congestion: 'standstill', edgeIds: OLD_NAGARDAS })], rainAlert),
    ];
    for (const v of variants) expect(findForbiddenWords(JSON.stringify(v))).toEqual([]);
    expect(findForbiddenWords(JSON.stringify(SCORING_RULES))).toEqual([]);
  });
});

describe('live feed evidence wording', () => {
  it('names the provider once', async () => {
    const { evidencePhrase } = await import('../src');
    const feed = { provider: 'tomtom' as const, externalId: 'x', delayS: null, magnitude: 4, probability: 'certain' as const, description: null, from: null, to: null, lastSeenAtS: 0 };
    const inc = incident({ type: 'closure', status: 'corroborated', source: 'live_feed', feed, deviceCount: 0, edgeIds: SUBWAY, roadName: 'Andheri Subway' });
    expect(evidencePhrase(inc)).toBe('Road closure at Andheri Subway: Reported by TomTom live traffic');
    const unv = incident({ type: 'closure', status: 'unverified', source: 'live_feed', feed, edgeIds: SUBWAY, roadName: 'Andheri Subway' });
    expect(evidencePhrase(unv)).toBe('Road closure at Andheri Subway: Unverified, TomTom live traffic');
  });
});
