import { describe, expect, it } from 'vitest';
import { motion, routeStyles } from '@vighnaway/tokens';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { makeProjection } from '@/lib/projection';
import { approximateRailway, buildScene, floodProneLines } from '@/lib/scene';
import { createTrip, incidentsTrip } from '@/lib/demoTrip';
import { graphFor } from '@/lib/scenario';
import { routeMotionTimeline } from '@/hooks/useRouteChangeMotion';
import { makeIncident, scenarioEvent } from './helpers';

const env = { graph: graphFor('car'), scenario: andheriScenario };

describe('schematic projection', () => {
  it('round-trips points and keeps the graph inside the panel', () => {
    const p = makeProjection(andheriGraph.bbox, 900, 800, 40);
    const pt = { lat: 19.12, lng: 72.85 };
    const xy = p.toXY(pt);
    const back = p.toLatLng(xy.x, xy.y);
    expect(back.lat).toBeCloseTo(pt.lat, 9);
    expect(back.lng).toBeCloseTo(pt.lng, 9);
    for (const n of andheriGraph.nodes) {
      const { x, y } = p.toXY(n);
      expect(x).toBeGreaterThanOrEqual(39);
      expect(x).toBeLessThanOrEqual(861);
      expect(y).toBeGreaterThanOrEqual(39);
      expect(y).toBeLessThanOrEqual(761);
    }
  });

  it('draws the railway approximation and the flood-prone underlay', () => {
    expect(approximateRailway(andheriGraph)).toHaveLength(2);
    const fp = floodProneLines(andheriGraph);
    expect(fp.length).toBeGreaterThan(0);
    expect(fp[0]!.color).toBe(routeStyles.floodProne.color);
  });
});

describe('route-change motion', () => {
  it('flashes twice, then dims and fades in, in about 900 ms', () => {
    const t = routeMotionTimeline();
    expect(t.filter((s) => s.flashOn)).toHaveLength(2);
    expect(t[t.length - 1]!.atMs).toBe(motion.routeChangeTotal);
  });

  it('scene: routes styled from tokens; old route and blocking segment drawn during the flash', () => {
    const point = scenarioEvent(andheriScenario, 'ev02-knee').report.point;
    let trip = createTrip(env, [], 0);
    trip = incidentsTrip(env, trip, [makeIncident({ id: 'f', type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, point, lastReportAtS: 60, updatedAtS: 60 })], 60);
    expect(trip.change).not.toBeNull();
    const flash = buildScene(env, andheriGraph, trip, { phase: 'flash', flashOn: true, change: trip.change });
    expect(flash.lines.some((l) => l.kind === 'old' && l.color === routeStyles.recommended.color)).toBe(true);
    expect(flash.lines.some((l) => l.kind === 'blocking' && l.opacity === 1)).toBe(true);
    expect(flash.lines.find((l) => l.kind === 'recommended')!.opacity).toBe(0);
    const settled = buildScene(env, andheriGraph, trip, { phase: 'settled', flashOn: false, change: trip.change });
    expect(settled.lines.some((l) => l.kind === 'old' || l.kind === 'blocking')).toBe(false);
    const rec = settled.lines.find((l) => l.kind === 'recommended')!;
    expect(rec.opacity).toBe(1);
    expect(rec.width).toBe(routeStyles.recommended.width);
    expect(settled.lines.some((l) => l.kind === 'blocked' && l.dash !== null)).toBe(true);
    expect(settled.vehicle).not.toBeNull();
  });
});
