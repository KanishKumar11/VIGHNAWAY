import { describe, expect, it } from 'vitest';
import { loadGraph, planTrip } from '../src';
import { gridGraph, noAlerts } from './helpers';

/**
 * P2-3 step-free walking profile: walks like the foot profile but never uses a way mapped as steps, says on how
 * many segments step-free access is not recorded, and gives only Medium confidence when there are any.
 */

// Row 0 is the short way (g0_0 to g2_0) and its first edge is mapped as steps; the middle cross street is steps too, so row 1 is the only way round: four footways.
const STEPS = { highway: 'steps' };
const FOOTWAY = { highway: 'footway' };
const overrides = {
  'g0_0|g1_0': STEPS,
  'g1_0|g1_1': STEPS,
  'g0_0|g0_1': FOOTWAY,
  'g0_1|g1_1': FOOTWAY,
  'g1_1|g2_1': FOOTWAY,
  'g2_0|g2_1': FOOTWAY,
};
const file = gridGraph(3, 2, 200, overrides);
const plan = (profile: 'foot' | 'step_free', f = file) =>
  planTrip({ graph: loadGraph(f, profile), origin: 'g0_0', destination: 'g2_0', incidents: [], nowS: 0, ...noAlerts });
const recommended = (p: ReturnType<typeof plan>) => p.routes.find((r) => r.routeId === p.recommendedRouteId)!;
const usesSteps = (routeEdgeIds: string[]) => routeEdgeIds.some((id) => id.startsWith('g0_0-g1_0') || id.startsWith('g1_0-g0_0'));

describe('step-free profile', () => {
  it('foot takes the short way over the steps; step-free walks round them', () => {
    const foot = recommended(plan('foot'));
    const free = recommended(plan('step_free'));
    expect(usesSteps(foot.edgeIds)).toBe(true);
    expect(usesSteps(free.edgeIds)).toBe(false);
    expect(free.etaS).toBeGreaterThan(foot.etaS);
    expect(free.distanceM).toBe(800);
  });

  it('a mapped way with foot=yes is still steps: step-free never uses it', () => {
    const f = gridGraph(3, 2, 200, { ...overrides, 'g0_0|g1_0': { highway: 'steps', foot: 'yes' } });
    expect(usesSteps(recommended(plan('step_free', f)).edgeIds)).toBe(false);
  });

  it('counts the segments where step-free access is not recorded and says so in the confidence', () => {
    const free = recommended(plan('step_free'));
    // The detour is four footways.
    expect(free.stepFreeUnknownCount).toBe(4);
    expect(free.explanation.confidence).toBe('medium');
    expect(free.explanation.confidenceReasons).toContain('Step-free access is not recorded on 4 segments of this route');
  });

  it('a route of ordinary roads has no unknown segments and keeps high confidence', () => {
    const roads = gridGraph(3, 1, 200);
    const p = planTrip({ graph: loadGraph(roads, 'step_free'), origin: 'g0_0', destination: 'g2_0', incidents: [], nowS: 0, ...noAlerts });
    const r = recommended(p);
    expect(r.stepFreeUnknownCount).toBe(0);
    expect(r.explanation.confidence).toBe('high');
  });

  it('the other profiles carry no step-free field at all', () => {
    expect('stepFreeUnknownCount' in recommended(plan('foot'))).toBe(false);
  });

  it('with no step-free way there is no route, not a route over steps', () => {
    const onlySteps = gridGraph(3, 1, 200, { 'g0_0|g1_0': STEPS });
    const p = planTrip({ graph: loadGraph(onlySteps, 'step_free'), origin: 'g0_0', destination: 'g2_0', incidents: [], nowS: 0, ...noAlerts });
    expect(p.recommendedRouteId).toBeNull();
    expect(p.routes.every((r) => !usesSteps(r.edgeIds))).toBe(true);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(plan('step_free'))).toBe(JSON.stringify(plan('step_free')));
  });
});
