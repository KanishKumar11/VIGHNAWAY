import { findForbiddenWords } from '@vighnaway/contracts';
import { andheriGraph } from '@vighnaway/scenario-data';
import {
  approximateRailway,
  chainEdges,
  estimateMonoWidth,
  etaDeltaBars,
  placeLabels,
  pointAtFraction,
  polylineLength,
  rectsOverlap,
  roadClass,
  samplePolyline,
  simplifyPath,
  smoothPath,
  splitNumberRuns,
  type LabelCandidate,
} from '@/lib/geometry';

describe('path smoothing (schematic roads and routes)', () => {
  it('keeps endpoints exactly and rounds every interior corner with a quadratic curve', () => {
    const d = smoothPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10,
    );
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d.endsWith('L100 100')).toBe(true);
    // The corner at (100,0) becomes: line to 10 px before it, curve with the corner as control, 10 px after it.
    expect(d).toContain('L90 0 Q100 0 100 10');
  });

  it('clamps the radius to half of the shorter neighbouring segment so curves never overlap', () => {
    const d = smoothPath(
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 100 },
      ],
      20,
    );
    expect(d).toContain('L4 0 Q8 0 8 4');
  });

  it('drops duplicate points and leaves straight lines straight', () => {
    expect(
      smoothPath(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
        10,
      ),
    ).toBe('M0 0 L50 0');
    expect(smoothPath([], 10)).toBe('');
  });

  it('simplifies wiggles below the tolerance but keeps real corners', () => {
    const wiggle = [
      { x: 0, y: 0 },
      { x: 10, y: 2 },
      { x: 20, y: -2 },
      { x: 30, y: 1 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ];
    const s = simplifyPath(wiggle, 4);
    expect(s).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ]);
    expect(simplifyPath(wiggle, 0)).toHaveLength(wiggle.length);
  });

  it('samples a polyline at a fixed step and finds the point and heading at a fraction', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 0, y: -40 },
    ];
    expect(polylineLength(line)).toBe(40);
    expect(samplePolyline(line, 10)).toHaveLength(5);
    const mid = pointAtFraction(line, 0.5)!;
    expect(mid.p).toEqual({ x: 0, y: -20 });
    expect(mid.headingDeg).toBeCloseTo(0); // up the screen = north
  });
});

describe('label collision avoidance', () => {
  const label = (id: string, x: number, y: number, priority: number): LabelCandidate => ({ id, text: id, x, y, priority, w: 60, h: 12 });
  const bounds = { x: 0, y: 0, w: 400, h: 400 };

  it('places the higher-priority label and moves or drops colliding lower-priority labels', () => {
    const placed = placeLabels([label('minor', 100, 100, 1), label('major', 100, 100, 10), label('third', 100, 100, 0)], [], bounds);
    const ids = placed.map((p) => p.id);
    expect(ids[0]).toBe('major');
    // "minor" fits above the major label; "third" fits below it; nothing overlaps.
    expect(ids).toEqual(['major', 'minor', 'third']);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) expect(rectsOverlap(placed[i]!.rect, placed[j]!.rect)).toBe(false);
    }
  });

  it('drops a label when every slot collides, and never leaves the visible bounds', () => {
    const obstacles = [{ x: 0, y: 60, w: 400, h: 80 }];
    expect(placeLabels([label('a', 100, 100, 1)], obstacles, bounds)).toEqual([]);
    expect(placeLabels([label('edge', 10, 100, 1)], [], bounds)).toEqual([]);
  });

  it('estimates monospaced label width from glyph count and tracking', () => {
    expect(estimateMonoWidth('ABCD', 10, 1)).toBeCloseTo(4 * (6 + 1));
  });
});

describe('schematic basemap from the road graph', () => {
  it('approximates the railway through every bridge and tunnel, spanning the bounding box', () => {
    const rail = approximateRailway(andheriGraph)!;
    expect(rail.length).toBeGreaterThanOrEqual(4);
    expect(rail[0]![1]).toBeCloseTo(andheriGraph.bbox.south);
    expect(rail[rail.length - 1]![1]).toBeCloseTo(andheriGraph.bbox.north);
    // South to north, and every point inside the graph's longitude span.
    for (let i = 1; i < rail.length; i++) expect(rail[i]![1]).toBeGreaterThanOrEqual(rail[i - 1]![1]);
    for (const [lng] of rail) expect(lng > andheriGraph.bbox.west && lng < andheriGraph.bbox.east).toBe(true);
    expect(approximateRailway({ edges: [], bbox: andheriGraph.bbox })).toBeNull();
  });

  it('chains same-named edges into one polyline per road', () => {
    const e = (id: string, from: string, to: string, coords: [number, number][], key = 'road') => ({ id, from, to, key, geometry: coords });
    const chains = chainEdges([
      e('b', 'n2', 'n3', [
        [1, 0],
        [2, 0],
      ]),
      e('a', 'n1', 'n2', [
        [0, 0],
        [1, 0],
      ]),
      e('c', 'n4', 'n3', [
        [3, 0],
        [2, 0],
      ]),
      e('x', 'n9', 'n8', [[5, 5], [6, 6]], 'other'),
    ]);
    const road = chains.find((c) => c.key === 'road')!;
    expect(road.ids).toHaveLength(3);
    expect(road.coords).toHaveLength(4);
    // Continuous: either direction, but the ends are the chain's end nodes.
    const ends = [road.coords[0]![0], road.coords[3]![0]].sort();
    expect(ends).toEqual([0, 3]);
    expect(chains.find((c) => c.key === 'other')!.ids).toEqual(['x']);
  });

  it('classes roads by weight', () => {
    expect(roadClass('trunk')).toBe('major');
    expect(roadClass('primary')).toBe('major');
    expect(roadClass('residential')).toBe('minor');
    expect(roadClass('footway')).toBe('path');
  });
});

describe('ETA delta bars (route comparison)', () => {
  const r = (routeId: string, etaS: number, role: 'recommended' | 'alternative' | 'usual_fastest' | 'blocked' = 'alternative', viable = true) => ({ routeId, etaS, role, viable });

  it('scales to the longest ETA and splits the part beyond the recommended ETA', () => {
    const bars = etaDeltaBars([r('a', 960, 'recommended'), r('b', 1260), r('c', 1500)], 'a');
    const [a, b, c] = bars;
    expect(a).toMatchObject({ label: '', deltaS: 0, extra: 0 });
    expect(a!.base).toBeCloseTo(960 / 1500);
    expect(b).toMatchObject({ label: '+5 min', deltaS: 300 });
    expect(b!.base).toBeCloseTo(960 / 1500);
    expect(b!.base + b!.extra).toBeCloseTo(1260 / 1500);
    expect(c!.base + c!.extra).toBeCloseTo(1);
    for (const bar of bars) expect(findForbiddenWords(bar.label)).toEqual([]);
  });

  it('shows a faster usual-fastest route as a negative delta with no extra segment', () => {
    const [, fast] = etaDeltaBars([r('a', 1200, 'recommended'), r('f', 1080, 'usual_fastest')], 'a');
    expect(fast).toMatchObject({ label: '−2 min', extra: 0 });
    expect(fast!.base).toBeCloseTo(1080 / 1200);
  });

  it('keeps a minimum visible bar and handles no recommendation', () => {
    const bars = etaDeltaBars([r('a', 10), r('b', 1000)], null, 0.1);
    expect(bars[0]!.base).toBe(0.1);
    expect(bars.every((b) => b.label === '')).toBe(true);
    expect(etaDeltaBars([], 'a')).toEqual([]);
  });
});

describe('hero ETA digit runs', () => {
  it('splits numbers from units so only digits roll', () => {
    expect(splitNumberRuns('16 min')).toEqual([
      { text: '16', numeric: true },
      { text: ' min', numeric: false },
    ]);
    expect(splitNumberRuns('1 h 5 min left').map((r) => r.text).join('')).toBe('1 h 5 min left');
  });
});
