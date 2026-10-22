import { describe, expect, it } from 'vitest';
import type { Incident } from '@vighnaway/contracts';
import {
  alertContext,
  buildIncidentIndex,
  evaluate,
  exceedsSwitchThreshold,
  loadGraph,
  planTrip,
  rank,
  type Evaluated,
} from '../src';
import { andheriGraph, edgesNamed, gridGraph, incident, noAlerts, place } from './helpers';

function ev(routeId: string, costS: number, distanceM = 1000, viable = true): Evaluated {
  return {
    routeId,
    name: routeId,
    edgeIds: [routeId],
    nodeIds: [],
    distanceM,
    etaS: costS,
    costS,
    viable,
    blockedBy: viable ? [] : [{ incidentId: 'i1', edgeId: routeId, reason: 'closure' }],
    hazards: [],
    dataGaps: [],
    floodProneEdgeCount: 0,
    crossings: [],
    roadNames: [],
    usesStaleBlock: false,
  };
}

describe('switching rule boundaries', () => {
  it('a gain exactly at the threshold does not switch; 1 s more does', () => {
    // current cost 1500: threshold max(120, 150) = 150
    expect(rank([ev('cur', 1500), ev('alt', 1350)], 'cur').recommendedRouteId).toBe('cur');
    expect(rank([ev('cur', 1500), ev('alt', 1349)], 'cur').recommendedRouteId).toBe('alt');
    // current cost 1000: threshold max(120, 100) = 120
    expect(rank([ev('cur', 1000), ev('alt', 880)], 'cur').recommendedRouteId).toBe('cur');
    expect(rank([ev('cur', 1000), ev('alt', 879)], 'cur').recommendedRouteId).toBe('alt');
    expect(rank([ev('cur', 1000), ev('alt', 879)], 'cur').decision).toMatchObject({ kind: 'outperformed', gainS: 121 });
  });

  it('uses integer arithmetic for the 10% threshold', () => {
    for (let cost = 1200; cost < 3000; cost += 7) {
      const t = Math.max(120, cost / 10);
      const atThreshold = Number.isInteger(t) ? t : Math.floor(t);
      expect(exceedsSwitchThreshold(cost, atThreshold)).toBe(false);
      expect(exceedsSwitchThreshold(cost, Math.floor(t) + 1)).toBe(true);
    }
  });

  it('an invalid previous recommendation switches regardless of the threshold', () => {
    const r = rank([ev('cur', 900, 1000, false), ev('alt', 2000)], 'cur');
    expect(r.recommendedRouteId).toBe('alt');
    expect(r.decision.kind).toBe('invalid');
  });

  it('ties resolve by cost, then distance, then route id', () => {
    expect(rank([ev('b', 1000, 900), ev('a', 1000, 1000)], null).recommendedRouteId).toBe('b');
    expect(rank([ev('b', 1000, 1000), ev('a', 1000, 1000)], null).recommendedRouteId).toBe('a');
    expect(rank([ev('a', 1001, 500), ev('b', 1000, 2000)], null).recommendedRouteId).toBe('b');
  });

  it('assigns roles', () => {
    const r = rank([ev('a', 900), ev('b', 1000), ev('c', 800, 1000, false)], null, { usualFastestRouteId: 'c' });
    expect(Object.fromEntries(r.roles)).toEqual({ a: 'recommended', b: 'alternative', c: 'blocked' });
  });

  it('no viable route', () => {
    const r = rank([ev('a', 900, 1000, false)], 'a');
    expect(r.recommendedRouteId).toBeNull();
    expect(r.decision.kind).toBe('no_viable_route');
  });
});

describe('two routes within rounding of each other (grid)', () => {
  // 3x2 grid: g0_0 -> g2_0 straight (2 edges) vs. around (4 edges). Make both ~equal by lengths.
  const g = gridGraph(3, 2, 200, {
    'g0_0|g1_0': { lengthM: 200.2 },
    'g1_0|g2_0': { lengthM: 200.2 },
    'g0_0|g0_1': { lengthM: 100 },
    'g0_1|g1_1': { lengthM: 100 },
    'g1_1|g2_1': { lengthM: 100 },
    'g2_0|g2_1': { lengthM: 100.4 },
  });
  const graph = loadGraph(g, 'car');
  it('rounds costs to whole seconds and breaks the tie deterministically', () => {
    const a = planTrip({ graph, origin: 'g0_0', destination: 'g2_0', incidents: [], nowS: 0, ...noAlerts });
    const b = planTrip({ graph, origin: 'g0_0', destination: 'g2_0', incidents: [], nowS: 0, ...noAlerts });
    const [r1, r2] = a.routes;
    expect(r1!.costS).toBe(r2!.costS);
    expect(Number.isInteger(r1!.costS)).toBe(true);
    // equal cost and the shorter route wins
    expect(r1!.distanceM).toBeLessThanOrEqual(r2!.distanceM);
    expect(a.recommendedRouteId).toBe(b.recommendedRouteId);
  });
});

describe('properties', () => {
  const car = loadGraph(andheriGraph, 'car');
  const subway = edgesNamed(andheriGraph, 'Andheri Subway');
  const base = planTrip({
    graph: car,
    origin: place('origin-marol').nodeId,
    destination: place('hosp-kokilaben').nodeId,
    incidents: [],
    nowS: 0,
    ...noAlerts,
  });
  const route = base.routes[0]!;
  const idx = route.edgeIds.map((id) => car.edgeIndex.get(id)!);
  const costWith = (inc: Incident | null, nowS = 600) => {
    const e = evaluate(car, idx, buildIncidentIndex(inc ? [inc] : []), alertContext([], true, nowS));
    return e.viable ? e.costS : Infinity;
  };
  const statuses = ['unverified', 'corroborated', 'verified'] as const;

  it('a more verified incident never lowers cost', () => {
    const variants: Partial<Incident>[] = [
      { type: 'flood', depth: 'ankle' },
      { type: 'flood', depth: 'knee' },
      { type: 'flood', depth: null },
      { type: 'closure' },
      { type: 'congestion', congestion: 'moderate' },
      { type: 'congestion', congestion: 'standstill' },
      { type: 'debris', severity: 'high' },
      { type: 'accident', severity: 'low', impassable: true },
    ];
    for (const v of variants) {
      for (const ageS of [0, 1800, 5000, 20000]) {
        let prev = -Infinity;
        for (const status of statuses) {
          const c = costWith(incident({ ...v, type: v.type!, edgeIds: subway, status, lastReportAtS: 0 }), ageS);
          expect(c, `${JSON.stringify(v)} ${status} @${ageS}`).toBeGreaterThanOrEqual(prev);
          prev = c;
        }
      }
    }
  });

  it('a more severe incident never lowers cost', () => {
    for (const status of statuses) {
      const chains: Partial<Incident>[][] = [
        [{ type: 'flood', depth: 'ankle' }, { type: 'flood', depth: 'knee' }, { type: 'flood', depth: 'waist' }],
        [
          { type: 'congestion', congestion: 'moderate' },
          { type: 'congestion', congestion: 'heavy' },
          { type: 'congestion', congestion: 'standstill' },
        ],
        [
          { type: 'debris', severity: 'low' },
          { type: 'debris', severity: 'medium' },
          { type: 'debris', severity: 'high' },
          { type: 'debris', severity: 'high', impassable: true },
        ],
      ];
      for (const chain of chains) {
        let prev = -Infinity;
        for (const v of chain) {
          const c = costWith(incident({ ...v, type: v.type!, edgeIds: subway, status }));
          expect(c).toBeGreaterThanOrEqual(prev);
          prev = c;
        }
      }
    }
  });

  it('a change below the threshold never flips the recommendation', () => {
    // Deterministic pseudo-random sweep over cost pairs.
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 2000; i++) {
      const cur = 600 + Math.floor(rnd() * 3000);
      const threshold = Math.max(120, cur / 10);
      const gain = Math.floor(rnd() * threshold);
      const r = rank([ev('cur', cur), ev('alt', cur - gain)], 'cur');
      expect(r.recommendedRouteId).toBe('cur');
    }
  });

  it('evaluation is idempotent across repeated runs', () => {
    const inputs = {
      graph: car,
      origin: place('origin-marol').nodeId,
      destination: place('hosp-kokilaben').nodeId,
      incidents: [incident({ id: 'p:1', type: 'flood', depth: 'ankle', edgeIds: subway })],
      nowS: 900,
      ...noAlerts,
    };
    const first = JSON.stringify(planTrip(inputs));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(planTrip({ ...inputs, incidents: [...inputs.incidents] }))).toBe(first);
  });
});
