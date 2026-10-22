import { describe, expect, it } from 'vitest';
import { loadGraph, planTrip } from '../src';
import { gridGraph, incident, rainAlert } from './helpers';

/** The data-gap rule counts one gap per continuous stretch of flood-prone edges, not one per edge. */

const pair = (a: number, b: number) => `g${a}_0|g${b}_0`;
const prone = { floodProne: true, name: 'Low Road' };
const edge = (a: number, b: number) => `g${a}_0-g${b}_0-0`;

function gapsFor(proneRuns: Array<[number, number]>, incidents = [] as ReturnType<typeof incident>[]) {
  const overrides: Record<string, object> = {};
  for (const [from, to] of proneRuns) for (let i = from; i < to; i++) overrides[pair(i, i + 1)] = prone;
  const graph = loadGraph(gridGraph(6, 1, 200, overrides), 'car');
  const plan = planTrip({ graph, origin: 'g0_0', destination: 'g5_0', incidents, nowS: 0, ...rainAlert });
  return plan.routes.find((r) => r.routeId === plan.recommendedRouteId)!;
}

describe('data gap per stretch', () => {
  it('a stretch of three flood-prone edges costs one gap, not three', () => {
    const r = gapsFor([[1, 4]]);
    expect(r.floodProneEdgeCount).toBe(3);
    expect(r.dataGaps).toHaveLength(1);
    expect(r.dataGaps[0]!.edgeId).toBe(edge(1, 2));
    expect(r.costS - r.etaS).toBe(r.dataGaps[0]!.penaltyS);
  });

  it('two stretches separated by an ordinary edge cost two gaps', () => {
    expect(gapsFor([[0, 2], [3, 5]]).dataGaps).toHaveLength(2);
  });

  it('a recent report on any edge of the stretch covers the whole stretch', () => {
    const report = incident({ type: 'flood', depth: 'ankle', status: 'resolved', edgeIds: [edge(2, 3)], lastReportAtS: 0 });
    expect(gapsFor([[1, 4]], [report]).dataGaps).toHaveLength(0);
    // A report on a different stretch does not cover this one.
    const elsewhere = incident({ type: 'flood', depth: 'ankle', status: 'resolved', edgeIds: [edge(4, 5)], lastReportAtS: 0 });
    expect(gapsFor([[0, 2], [3, 5]], [elsewhere]).dataGaps).toHaveLength(1);
  });
});
