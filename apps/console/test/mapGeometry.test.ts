import { describe, expect, it } from 'vitest';
import type { GraphFile } from '@vighnaway/contracts';
import { andheriGraph } from '@vighnaway/scenario-data';
import {
  boxesOverlap,
  edgesGeometry,
  mergeCollinear,
  offsetPolyline,
  placeLabels,
  renderGeometryIndex,
  roadChains,
  roundedPath,
  simplifyLngLat,
  slideClear,
  uprightAngle,
  type LabelCandidate,
} from '@/lib/mapGeometry';

describe('path smoothing (rendering only)', () => {
  it('keeps straight runs straight and both end points', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], 20);
    expect(d).toBe('M0 0 L50 0 L100 0');
  });

  it('rounds a corner with a quadratic curve that stays within the radius', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 20);
    expect(d).toBe('M0 0 L80 0 Q100 0 100 20 L100 100');
  });

  it('limits the radius to half of the shorter neighbouring segment', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }], 40);
    expect(d).toContain('L5 0 Q10 0 10 5');
  });

  it('drops duplicate points and returns nothing for a single point', () => {
    expect(roundedPath([{ x: 1, y: 1 }, { x: 1, y: 1 }], 10)).toBe('');
  });

  it('merges near-collinear points for label anchoring', () => {
    expect(mergeCollinear([{ x: 0, y: 0 }, { x: 50, y: 1 }, { x: 100, y: 0 }, { x: 100, y: 80 }])).toHaveLength(3);
  });

  it('offsets a polyline sideways by a constant distance', () => {
    const o = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
    expect(o.every((p) => Math.abs(Math.abs(p.y) - 10) < 1e-9)).toBe(true);
  });
});

describe('display geometry', () => {
  it('simplifies small wiggles but keeps end points', () => {
    const line: [number, number][] = [[72.85, 19.12], [72.8505, 19.12001], [72.851, 19.12]];
    expect(simplifyLngLat(line, 10)).toEqual([line[0], line[2]]);
    expect(simplifyLngLat(line, 0)).toEqual(line);
  });

  it('gives twins the same line reversed, so routes and roads share pixels', () => {
    const idx = renderGeometryIndex(andheriGraph, 55);
    for (const e of andheriGraph.edges) {
      // A closed loop (a cul-de-sac ring) has a distinct twin that runs the same way round.
      if (!e.reverseId || e.from === e.to) continue;
      expect(idx.get(e.reverseId)).toEqual([...idx.get(e.id)!].reverse());
    }
    const route = andheriGraph.edges.slice(0, 1).map((e) => e.id);
    expect(edgesGeometry(route, idx)).toEqual(idx.get(route[0]!));
    expect(edgesGeometry(['missing'], idx)).toBeNull();
  });

  it('chains edges of the same road into continuous lines, one per twin pair', () => {
    const chains = roadChains(andheriGraph);
    const unique = new Set(andheriGraph.edges.map((e) => [e.id, e.reverseId].sort().join('|'))).size;
    expect(chains.reduce((n, c) => n + c.edgeIds.length, 0)).toBe(unique);
    const sv = chains.filter((c) => c.name === 'Swami Vivekanand Road');
    expect(sv.length).toBeGreaterThan(0);
    expect(sv.length).toBeLessThan(andheriGraph.edges.filter((e) => e.name === 'Swami Vivekanand Road').length / 2);
  });

  it('walks a two-edge road in order regardless of edge direction', () => {
    const file = {
      edges: [
        { id: 'a', from: 'n1', to: 'n2', reverseId: null, wayId: 'w', name: 'R', highway: 'primary', bridge: false, tunnel: false, floodProne: false, geometry: [[0, 0], [1, 0]] },
        { id: 'b', from: 'n3', to: 'n2', reverseId: null, wayId: 'w', name: 'R', highway: 'primary', bridge: false, tunnel: false, floodProne: false, geometry: [[2, 0], [1, 0]] },
      ],
    } as unknown as GraphFile;
    const [c] = roadChains(file);
    expect(c!.coords).toEqual([[0, 0], [1, 0], [2, 0]]);
  });
});

describe('label collision avoidance', () => {
  it('detects overlap of rotated boxes with the separating-axis test', () => {
    const a = { cx: 0, cy: 0, w: 100, h: 10, angleDeg: 45 };
    expect(boxesOverlap(a, { cx: 0, cy: 0, w: 10, h: 10, angleDeg: 0 })).toBe(true);
    // Inside the axis-aligned bounds of the rotated label, but clear of the label itself.
    expect(boxesOverlap(a, { cx: 30, cy: -30, w: 10, h: 10, angleDeg: 0 })).toBe(false);
  });

  it('places higher priority first, tries later anchors, and drops what cannot fit', () => {
    const c = (id: string, priority: number, anchors: { x: number; y: number }[]): LabelCandidate => ({
      id,
      text: id,
      priority,
      width: 40,
      height: 10,
      anchors: anchors.map((a) => ({ ...a, angleDeg: 0 })),
    });
    const placed = placeLabels(
      [c('low', 1, [{ x: 50, y: 50 }]), c('high', 9, [{ x: 50, y: 50 }]), c('moves', 5, [{ x: 50, y: 50 }, { x: 50, y: 90 }]), c('blocked', 5, [{ x: 150, y: 50 }])],
      [{ cx: 150, cy: 50, w: 20, h: 20, angleDeg: 0 }],
      { width: 200, height: 200 },
    );
    expect(placed.map((p) => p.id)).toEqual(['high', 'moves']);
    expect(placed[1]!.y).toBe(90);
  });

  it('keeps text upright and reads vertical text bottom to top', () => {
    expect(uprightAngle(180)).toBe(0);
    expect(uprightAngle(90)).toBe(-90);
    expect(uprightAngle(-90)).toBe(-90);
    expect(uprightAngle(135)).toBe(-45);
  });

  it('slides a marker along its line until it clears another marker', () => {
    const line = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const q = slideClear(line, { x: 100, y: 0 }, [{ x: 100, y: 0 }], 40);
    expect(Math.abs(q.x - 100)).toBeGreaterThanOrEqual(40);
    expect(q.y).toBe(0);
    expect(slideClear(line, { x: 10, y: 0 }, [{ x: 150, y: 0 }], 40)).toEqual({ x: 10, y: 0 });
  });
});
