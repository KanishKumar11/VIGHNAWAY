import { andheriGraph } from '@vighnaway/scenario-data';
import type { Incident } from '@vighnaway/contracts';
import { getGraph, snapToRoad } from '@/lib/engine';
import { MAP_MARKERS_MAX, mapIncidents } from '@/features/navigate/mapModel';

const car = getGraph(andheriGraph, 'car');

describe('snapToRoad (what a report is sent against)', () => {
  it('puts a point beside a road onto the road and names it', () => {
    // The point the API accepted as a flood report on Swami Vivekanand Road.
    const snap = snapToRoad(car, { lat: 19.12429, lng: 72.84673 });
    expect(snap?.roadName).toBe('Swami Vivekanand Road');
    expect(snap!.distanceM).toBeLessThan(5);
    // A pin 15 m to the side still lands on a road, and the sent point is on it.
    const beside = snapToRoad(car, { lat: 19.12429, lng: 72.84688 });
    expect(beside).not.toBeNull();
    expect(beside!.distanceM).toBeLessThan(40);
  });

  it('rejects a point outside the mapped area (Amritsar)', () => {
    expect(snapToRoad(car, { lat: 31.63557, lng: 74.82435 })).toBeNull();
  });

  it('rejects a point inside the area but far from any road', () => {
    // Middle of the Arabian Sea off Juhu.
    expect(snapToRoad(car, { lat: 19.1, lng: 72.818 })).toBeNull();
  });
});

const incident = (n: number, over: Partial<Incident> = {}): Incident =>
  ({
    id: `inc-${n}`,
    scenarioId: 's',
    type: 'congestion',
    status: 'unverified',
    source: 'live_feed',
    depth: null,
    congestion: 'heavy',
    severity: null,
    impassable: false,
    conflicting: false,
    edgeIds: [],
    point: { lat: 19.12 + n * 1e-5, lng: 72.84 },
    roadName: null,
    reportCount: 0,
    deviceCount: 0,
    createdAtS: 0,
    lastReportAtS: n,
    updatedAtS: n,
    verifiedAtS: null,
    verifiedBy: null,
    closedAtS: null,
    linkedIncidentId: null,
    note: null,
    seq: n,
    ...over,
  }) as Incident;

describe('mapIncidents (marker cap)', () => {
  it('draws everything while the list is small', () => {
    const list = Array.from({ length: 10 }, (_, i) => incident(i));
    expect(mapIncidents(car, list, [], null, null)).toHaveLength(10);
  });

  it('caps a live-feed flood of incidents and drops those far from the routes', () => {
    const near = Array.from({ length: 80 }, (_, i) => incident(i));
    const far = Array.from({ length: 80 }, (_, i) => incident(1000 + i, { point: { lat: 19.4, lng: 73.1 } }));
    const origin = { id: 'o', name: 'o', point: { lat: 19.12, lng: 72.84 }, nodeId: 'n' } as never;
    const out = mapIncidents(car, [...near, ...far], [], origin, origin);
    expect(out.length).toBeLessThanOrEqual(MAP_MARKERS_MAX);
    expect(out.every((i) => i.point.lat < 19.2)).toBe(true);
  });
});
