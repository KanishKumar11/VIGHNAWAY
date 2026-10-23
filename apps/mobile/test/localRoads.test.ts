import { accessFrom, buildLocalGraph, fetchRadiusM, nearestNode, overpassMirrors, reverseLeg, wayAllowed, type OsmWay } from '@/features/guidance/localRoads';

const LAT0 = 31.634;
const LNG0 = 74.822;
const M_N = 1 / 110574;
const M_E = 1 / (111320 * Math.cos((LAT0 * Math.PI) / 180));
const g = (n: number, e: number) => ({ lat: LAT0 + n * M_N, lon: LNG0 + e * M_E });
const pt = (n: number, e: number) => ({ lat: g(n, e).lat, lng: g(n, e).lon });

/** A way through the given nodes (id, metres north, metres east). */
const way = (id: number, tags: Record<string, string>, ...nodes: [number, number, number][]): OsmWay => ({
  id,
  tags,
  nodes: nodes.map((n) => n[0]),
  geometry: nodes.map((n) => g(n[1], n[2])),
});

// A campus: the start is on Campus Lane (nodes 1-2-3), which meets Main Road at node 4. Main Road
// runs west to node 5 and east to node 6; 5 and 6 are the nodes the engine's graph has.
const campus: OsmWay[] = [
  way(100, { highway: 'residential', name: 'Campus Lane' }, [1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 300, 0]),
  way(200, { highway: 'primary', name: 'Main Road' }, [5, 300, -400], [4, 300, 0], [6, 300, 400]),
  way(300, { highway: 'footway' }, [2, 100, 0], [7, 100, 60]),
];
const isEntry = (id: number) => id === 5 || id === 6;

describe('which ways a profile may use', () => {
  it('keeps footways and steps off the road for vehicles, and lets walkers use them', () => {
    expect(wayAllowed({ highway: 'residential' }, 'car')).toBe(true);
    expect(wayAllowed({ highway: 'footway' }, 'car')).toBe(false);
    expect(wayAllowed({ highway: 'footway' }, 'foot')).toBe(true);
    expect(wayAllowed({ highway: 'steps' }, 'step_free')).toBe(false);
    expect(wayAllowed({ highway: 'steps' }, 'foot')).toBe(true);
  });
  it('honours access=no, and motorcycle=no for two-wheelers only', () => {
    expect(wayAllowed({ highway: 'service', access: 'no' }, 'car')).toBe(false);
    expect(wayAllowed({ highway: 'service', motorcycle: 'no' }, 'car')).toBe(true);
    expect(wayAllowed({ highway: 'service', motorcycle: 'no' }, 'two_wheeler')).toBe(false);
    expect(wayAllowed({ highway: 'service', foot: 'no' }, 'foot')).toBe(false);
  });
  it('allows a private campus road (the traveller is already inside it)', () => {
    expect(wayAllowed({ highway: 'service', access: 'private' }, 'car')).toBe(true);
  });
});

describe('the way from a campus to the road network', () => {
  it('follows the lane to the main road and on to the nearest node the engine has', () => {
    const leg = accessFrom(buildLocalGraph(campus, 'car'), pt(0, 0), isEntry, null)!;
    expect(leg).not.toBeNull();
    expect(['5', '6']).toContain(leg.entryNodeId);
    // 300 m down the lane, 400 m along the main road.
    expect(leg.lengthM).toBeGreaterThan(690);
    expect(leg.lengthM).toBeLessThan(710);
    expect(leg.points[0]!.name).toBe('Campus Lane');
  });

  it('joins the road on the side the trip is heading', () => {
    const local = buildLocalGraph(campus, 'car');
    const east = accessFrom(local, pt(0, 0), isEntry, pt(300, 20000))!;
    const west = accessFrom(local, pt(0, 0), isEntry, pt(300, -20000))!;
    expect(east.entryNodeId).toBe('6');
    expect(west.entryNodeId).toBe('5');
  });

  it('adds a straight link from a start that is off the lane, and counts it', () => {
    const off = pt(0, 40);
    const leg = accessFrom(buildLocalGraph(campus, 'car'), off, isEntry, null)!;
    expect(leg.points[0]!.lat).toBeCloseTo(off.lat, 6);
    expect(leg.lengthM).toBeGreaterThan(730);
  });

  it('finds no way when no local road reaches an entry, or the start is far from any road', () => {
    const local = buildLocalGraph(campus, 'car');
    expect(accessFrom(local, pt(0, 0), () => false, null)).toBeNull();
    expect(accessFrom(local, pt(5000, 5000), isEntry, null)).toBeNull();
  });

  it('obeys one-way streets for vehicles but not for walkers', () => {
    const oneWayAway: OsmWay[] = [way(100, { highway: 'residential', oneway: 'yes', name: 'Lane' }, [4, 300, 0], [3, 200, 0], [2, 100, 0], [1, 0, 0]), campus[1]!];
    expect(accessFrom(buildLocalGraph(oneWayAway, 'car'), pt(0, 0), isEntry, null)).toBeNull();
    expect(accessFrom(buildLocalGraph(oneWayAway, 'foot'), pt(0, 0), isEntry, null)).not.toBeNull();
  });

  it('finds the way in to a destination by searching the reversed graph, then turning the leg round', () => {
    // Travelling OUT of the network into the campus along a one-way lane that runs 4 -> 1.
    const inbound: OsmWay[] = [way(100, { highway: 'residential', oneway: 'yes', name: 'Lane' }, [4, 300, 0], [3, 200, 0], [2, 100, 0], [1, 0, 0]), campus[1]!];
    const back = accessFrom(buildLocalGraph(inbound, 'car', true), pt(0, 0), isEntry, null)!;
    expect(back).not.toBeNull();
    const leg = reverseLeg(back);
    expect(leg.points[0]!.lat).toBeCloseTo(back.points[back.points.length - 1]!.lat, 8);
    expect(leg.points[leg.points.length - 1]!.lat).toBeCloseTo(back.points[0]!.lat, 8);
    // Walking in order, the leg ends at the destination, and the road names run forward along it.
    expect(leg.points[leg.points.length - 1]!.name).toBeUndefined();
    expect(leg.points.some((p) => p.name === 'Lane')).toBe(true);
  });
});

describe('local road data', () => {
  it('picks the nearest local node within range', () => {
    const local = buildLocalGraph(campus, 'car');
    expect(nearestNode(local, pt(95, 0), 50)?.id).toBe(2);
    expect(nearestNode(local, pt(1000, 1000), 50)).toBeNull();
  });
  it('sizes the fetch to the gap, within bounds', () => {
    expect(fetchRadiusM(100)).toBe(700);
    expect(fetchRadiusM(1000)).toBe(1900);
    expect(fetchRadiusM(9000)).toBe(2500);
  });
  it('takes Overpass hosts from the environment, else the public mirrors', () => {
    expect(overpassMirrors(' https://a.example/api , https://b.example/api')).toEqual(['https://a.example/api', 'https://b.example/api']);
    expect(overpassMirrors('').length).toBeGreaterThan(1);
  });
});
