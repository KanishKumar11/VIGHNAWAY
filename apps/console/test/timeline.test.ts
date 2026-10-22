import { describe, expect, it } from 'vitest';
import { andheriScenario } from '@vighnaway/scenario-data';
import { clusterTicks, passedCount, pctAt, timelineSpan, timelineTicks } from '@/lib/timeline';
import { boundsOf, makeProjection } from '@/lib/projection';

describe('simulation timeline', () => {
  const span = timelineSpan(andheriScenario.events);
  const ticks = timelineTicks(andheriScenario.events, span);

  it('spans the scripted events plus a tail, in whole minutes', () => {
    expect(span.startS).toBe(0);
    expect(span.endS % 60).toBe(0);
    expect(span.endS).toBeGreaterThan(Math.max(...andheriScenario.events.map((e) => e.atS)));
  });

  it('puts every event at its sim time, in order', () => {
    expect(ticks).toHaveLength(andheriScenario.events.length);
    for (const t of ticks) expect(t.pct).toBeCloseTo((t.atS / span.endS) * 100, 9);
    expect([...ticks].sort((a, b) => a.atS - b.atS)).toEqual(ticks);
    expect(ticks[0]!.type).toBe('flood');
    expect(ticks.find((t) => t.kind === 'verify')!.type).toBeNull();
  });

  it('clusters events that would collide and keeps distant ones apart', () => {
    const clusters = clusterTicks(ticks, 3.5);
    // 360 s / 370 s and 480 s / 490 s are ten seconds apart.
    expect(clusters.map((c) => c.ticks.length)).toEqual([1, 1, 1, 2, 2]);
    expect(clusters[3]!.pct).toBe(ticks[3]!.pct);
  });

  it('clamps the playhead and counts passed events', () => {
    expect(pctAt(-5, span)).toBe(0);
    expect(pctAt(span.endS * 2, span)).toBe(100);
    expect(passedCount(ticks, 180)).toBe(2);
  });
});

describe('camera fit with floating panels', () => {
  it('fits the trip inside the space the rails leave free', () => {
    const pad = { top: 112, right: 484, bottom: 164, left: 424 };
    const pts = andheriScenario.places.map((p) => p.point);
    const proj = makeProjection(boundsOf(pts)!, 1920, 1080, pad);
    for (const p of pts) {
      const { x, y } = proj.toXY(p);
      expect(x).toBeGreaterThanOrEqual(pad.left - 1e-6);
      expect(x).toBeLessThanOrEqual(1920 - pad.right + 1e-6);
      expect(y).toBeGreaterThanOrEqual(pad.top - 1e-6);
      expect(y).toBeLessThanOrEqual(1080 - pad.bottom + 1e-6);
    }
  });
});
