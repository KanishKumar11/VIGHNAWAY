import { describe, expect, it } from 'vitest';
import { buildReceipt, inputsHash, loadGraph, planTrip, SCORING_RULES } from '../src';
import { hashValue, stripText } from '../src/hash';
import { gridGraph, incident, noAlerts } from './helpers';

/**
 * P2-9 "Prefer well-lit roads": walking only, ranking only, off by default. Unlit ways and walking-concern reports
 * add to the ranking cost; the displayed time, hard blocks and viability never change.
 */

// A 100 m grid, 4 columns by 2 rows. Row 0 is the short way (300 m); row 1 is a detour (500 m).
const SPACING = 100;
const lit = (over: Record<string, object> = {}) => gridGraph(4, 2, SPACING, over);
const foot = (f = lit()) => loadGraph(f, 'foot');
const trip = (graph = foot(), extra: Record<string, unknown> = {}) =>
  planTrip({ graph, origin: 'g0_0', destination: 'g3_0', incidents: [], nowS: 0, ...noAlerts, ...extra } as never);
const rec = (p: ReturnType<typeof trip>) => p.routes.find((r) => r.routeId === p.recommendedRouteId)!;
const row0 = ['g0_0-g1_0-0', 'g1_0-g2_0-0', 'g2_0-g3_0-0'];
const concern = (status: 'unverified' | 'corroborated' | 'verified', over: Record<string, unknown> = {}) =>
  incident({ type: 'walking_concern', concern: 'poorly_lit', status, edgeIds: [row0[1]!], lastReportAtS: 0, ...over } as never);

describe('preferLit off', () => {
  it('changes nothing: absent, false, or on for a profile that is not walking all hash as before', () => {
    const base = hashValue(stripText(trip()));
    expect(hashValue(stripText(trip(foot(), { preferLit: false, walkingConcerns: [concern('verified')] })))).toBe(base);
    expect(hashValue(stripText(trip(foot(), { walkingConcerns: [concern('verified')] })))).toBe(base);
    const car = loadGraph(lit(), 'car');
    expect(hashValue(stripText(trip(car, { preferLit: true, walkingConcerns: [concern('verified')] })))).toBe(hashValue(stripText(trip(car))));
    expect(rec(trip(car, { preferLit: true })).lighting).toBeUndefined();
  });
});

describe('lit=no ways', () => {
  it('cost 25% extra of their travel time in the ranking and leave the displayed time alone', () => {
    const f = lit({ 'g1_0|g2_0': { lit: false } });
    const off = rec(trip(foot(f)));
    const on = rec(trip(foot(f), { preferLit: true }));
    const edge = foot(f).edges.find((e) => e.id === row0[1])!;
    expect(on.etaS).toBe(off.etaS);
    expect(on.costS - off.costS).toBe(Math.round(SCORING_RULES.preferLit.value.unlitExtraShare * edge.timeS));
    expect(on.lighting).toMatchObject({ unlitCount: 1 });
  });
});

describe('unknown lighting', () => {
  it('is counted, and confidence says so', () => {
    const on = rec(trip(foot(), { preferLit: true }));
    expect(on.lighting).toMatchObject({ unlitCount: 0, unknownCount: 3, concernIds: [] });
    expect(on.explanation.confidence).toBe('medium');
    expect(on.explanation.confidenceReasons).toContain('Lighting data is missing on 3 segments of this route');
  });

  it('is not claimed where the map says lit=yes', () => {
    const f = lit({ 'g0_0|g1_0': { lit: true }, 'g1_0|g2_0': { lit: true }, 'g2_0|g3_0': { lit: true } });
    const on = rec(trip(foot(f), { preferLit: true }));
    expect(on.lighting?.unknownCount).toBe(0);
    // Another reason may still lower confidence (a close alternative), but never a lighting one.
    expect(on.explanation.confidenceReasons.join(' ')).not.toMatch(/Lighting data/);
  });
});

describe('walking-concern reports on the route', () => {
  const w = SCORING_RULES.verificationWeight.value;
  const penalty = SCORING_RULES.preferLit.value.concernPenaltyS;

  it('cost 300 s times the verification weight at each open status, once per report', () => {
    const base = rec(trip(foot(), { preferLit: true }));
    for (const status of ['unverified', 'corroborated', 'verified'] as const) {
      const on = rec(trip(foot(), { preferLit: true, walkingConcerns: [concern(status)] }));
      // Row 0 may stop being the recommendation; compare the same route.
      const same = trip(foot(), { preferLit: true, walkingConcerns: [concern(status)] }).routes.find((r) => r.routeId === base.routeId)!;
      expect(same.costS - base.costS).toBe(Math.round(penalty * w[status]));
      expect(same.etaS).toBe(base.etaS);
      expect(same.lighting?.concernIds).toHaveLength(1);
      expect(on.viable).toBe(true);
    }
    // Two reports on the same road are two penalties; one report over two edges is one.
    const one = concern('verified', { edgeIds: [row0[0]!, row0[1]!] });
    const same = trip(foot(), { preferLit: true, walkingConcerns: [one] }).routes.find((r) => r.routeId === base.routeId)!;
    expect(same.costS - base.costS).toBe(Math.round(penalty * w.verified));
  });

  it('fall with age, and resolved or dismissed reports cost nothing', () => {
    const base = rec(trip(foot(), { preferLit: true }));
    const at = (inc: ReturnType<typeof concern>, nowS: number) => trip(foot(), { preferLit: true, nowS, walkingConcerns: [inc] }).routes.find((r) => r.routeId === base.routeId)!.costS;
    const fresh = at(concern('verified'), 0) - base.costS;
    const old = at(concern('verified'), 5 * 3600) - base.costS;
    expect(old).toBeLessThan(fresh);
    expect(old).toBeGreaterThan(0);
    for (const status of ['resolved', 'dismissed'] as const) {
      expect(at(concern(status as never), 0)).toBe(base.costS);
    }
  });

  it('can move the recommendation to a longer, unreported road, without changing any time shown', () => {
    const off = rec(trip(foot(), { walkingConcerns: [concern('verified')] }));
    const on = rec(trip(foot(), { preferLit: true, walkingConcerns: [concern('verified')] }));
    expect(off.edgeIds).toEqual(row0);
    expect(on.edgeIds).not.toEqual(row0);
    expect(on.distanceM).toBeGreaterThan(off.distanceM);
    expect(on.viable).toBe(true);
    expect(on.explanation.reason).not.toMatch(/safe|danger/i);
  });
});

describe('the preference never makes a viable route not viable (property)', () => {
  it('holds across statuses, ages and lit values', () => {
    const statuses = ['unverified', 'corroborated', 'verified'] as const;
    for (const [i, status] of statuses.entries()) {
      for (const nowS of [0, 3600, 5 * 3600]) {
        const f = lit({ 'g0_0|g1_0': { lit: i % 2 === 0 ? false : true }, 'g2_0|g3_0': { lit: false } });
        const off = trip(foot(f), { nowS });
        const on = trip(foot(f), { nowS, preferLit: true, walkingConcerns: [concern(status, { lastReportAtS: 0 })] });
        expect(on.noViableRoute).toBe(off.noViableRoute);
        for (const r of on.routes) {
          const was = off.routes.find((o) => o.routeId === r.routeId);
          if (was) {
            expect(r.viable).toBe(was.viable);
            expect(r.etaS).toBe(was.etaS);
            expect(r.costS).toBeGreaterThanOrEqual(was.costS);
          }
        }
      }
    }
  });
});

describe('decision receipt', () => {
  it('records the preference as an input: on and off do not share a hash, and off hashes as before', () => {
    const graph = foot();
    const input = { graph, origin: 'g0_0', destination: 'g3_0', incidents: [], nowS: 0, ...noAlerts };
    const meta = { originNodeId: 'g0_0', destinationNodeId: 'g3_0' };
    const off = inputsHash(input as never, meta);
    expect(inputsHash({ ...input, preferLit: false } as never, meta)).toBe(off);
    const on = inputsHash({ ...input, preferLit: true } as never, meta);
    expect(on).not.toBe(off);
    expect(inputsHash({ ...input, preferLit: true, walkingConcerns: [concern('verified')] } as never, meta)).not.toBe(on);
    expect(typeof buildReceipt).toBe('function');
  });
});
