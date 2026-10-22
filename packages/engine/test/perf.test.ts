import { describe, expect, it } from 'vitest';
import { loadGraph, planTrip } from '../src';
import { andheriGraph, gridGraph, place, rainAlert } from './helpers';

// Node.js timings. The 200 ms budget applies to a mid-range Android phone (Hermes); measure it
// there with the debug screen. These tests guard against regressions in the meantime.
describe('performance', () => {
  it('plans the Andheri trip well under 200 ms', () => {
    const car = loadGraph(andheriGraph, 'car');
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      planTrip({ graph: car, origin: place('origin-marol').nodeId, destination: place('hosp-kokilaben').nodeId, incidents: [], nowS: i, ...rainAlert });
    }
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });

  it('plans across a 3,900-node grid (OSM-extract scale) under 200 ms in Node', () => {
    const g = loadGraph(gridGraph(72, 54, 60), 'car');
    // Best of three (distinct endpoints, so no memo hits) to keep CI load from making this flaky.
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      planTrip({ graph: g, origin: `g${3 + i}_3`, destination: `g66_${48 - i}`, incidents: [], nowS: i, ...rainAlert });
      times.push(performance.now() - t0);
    }
    expect(Math.min(...times)).toBeLessThan(200);
  });
});
