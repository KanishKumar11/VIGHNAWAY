import { describe, expect, it } from 'vitest';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { boxesOverlap, renderGeometryIndex, roadChains } from '@/lib/mapGeometry';
import { buildMapLabels, labelSide, mapObstacles, type MapLabelInput } from '@/lib/mapLabels';
import { boundsOf, makeProjection } from '@/lib/projection';
import { approximateRailway } from '@/lib/scene';

const pad = { top: 112, right: 484, bottom: 164, left: 424 };
const proj = makeProjection(boundsOf(andheriScenario.places.map((p) => p.point), 0.03)!, 1920, 1080, pad);
const input: MapLabelInput = {
  proj,
  width: 1920,
  height: 1080,
  pad,
  chains: roadChains(andheriGraph, renderGeometryIndex(andheriGraph, 55)),
  railway: approximateRailway(andheriGraph),
  railwayText: 'Western Railway (approximate)',
  font: { size: 12, lineHeight: 16, tracking: 1.2 },
  incidents: [andheriScenario.places[0]!.point],
  places: andheriScenario.places.map((p) => ({ point: p.point, side: 'center' as const, labelWidth: 200 })),
  crosses: [],
  vehicle: null,
  routes: [],
};

describe('schematic map labels', () => {
  const placed = buildMapLabels(input);

  it('labels the crossings and the railway that carry the story', () => {
    const ids = placed.map((l) => l.id);
    expect(ids).toContain('rail');
    expect(ids.filter((id) => id.startsWith('x:')).length).toBeGreaterThanOrEqual(3);
    expect(ids.some((id) => id.startsWith('r:'))).toBe(true);
  });

  it('never overlaps another label, a marker, a place name or a floating panel', () => {
    const obstacles = mapObstacles(input);
    for (const [i, a] of placed.entries()) {
      for (const b of placed.slice(i + 1)) expect(boxesOverlap(a.box, b.box), `${a.id} / ${b.id}`).toBe(false);
      for (const o of obstacles) expect(boxesOverlap(a.box, o), a.id).toBe(false);
    }
  });

  it('puts place names on the inner side near the panels', () => {
    expect(labelSide(pad.left + 10, 1920, pad, 200)).toBe('start');
    expect(labelSide(1920 - pad.right - 10, 1920, pad, 200)).toBe('end');
    expect(labelSide(960, 1920, pad, 200)).toBe('center');
  });
});
