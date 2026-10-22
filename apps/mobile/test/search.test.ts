import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { buildGazetteer, entryToPlace, normalise, searchEntries } from '@/features/search/gazetteer';
import { insideGraphArea, placeFromPosition } from '@/features/search/myLocation';
import { choosePlace, runPlanNow } from '@/features/trip/planner';
import { isCustomPlaceId, placeById, useScenario } from '@/stores/scenario';
import { useTrip } from '@/stores/trip';

const entries = buildGazetteer(andheriGraph, andheriScenario.places);
const roadNamed = (needle: string) => searchEntries(entries, needle).find((e) => e.kind === 'road')!;

describe('place search (offline gazetteer)', () => {
  it('indexes the scenario places and many named roads, not only the hospitals', () => {
    const roads = entries.filter((e) => e.kind === 'road');
    expect(roads.length).toBeGreaterThan(200);
    expect(entries.filter((e) => e.kind !== 'road')).toHaveLength(andheriScenario.places.length);
    expect(new Set(roads.map((r) => r.name)).size).toBe(roads.length);
  });

  it('an empty query suggests the scenario places only, hospitals first', () => {
    const s = searchEntries(entries, '   ');
    expect(s.every((e) => e.kind !== 'road')).toBe(true);
    expect(s[0]!.kind).toBe('hospital');
  });

  it('finds a hospital by a partial, differently cased name', () => {
    const r = searchEntries(entries, 'KOKILA');
    expect(r[0]!.id).toBe('hosp-kokilaben');
  });

  it('finds roads by any word, accents and punctuation ignored', () => {
    expect(roadNamed('chagla').name).toBe('M C Chagla Road');
    expect(roadNamed('nagardas').name).toMatch(/Nagardas/);
    expect(normalise('  Café-Road!! ')).toBe('cafe road');
  });

  it('also matches the alternative name in brackets', () => {
    expect(searchEntries(entries, 'andheri kurla').some((e) => e.name.includes('Andheri Kurla Road'))).toBe(true);
  });

  it('returns nothing for text that matches no place, and treats input as plain text', () => {
    expect(searchEntries(entries, 'zzzzqqq')).toEqual([]);
    expect(searchEntries(entries, '<script>alert(1)</script> ((( [[[ \\')).toEqual([]);
  });

  it('orders equal matches nearest first when a reference point is given', () => {
    const a = searchEntries(entries, 'road', { lat: 19.108, lng: 72.878 });
    const b = searchEntries(entries, 'road', { lat: 19.14, lng: 72.82 });
    expect(a.length).toBeGreaterThan(5);
    expect(a[0]!.id).not.toBe(b[0]!.id);
  });

  it('every road result sits on a graph node and inside the map area', () => {
    const nodes = new Set(andheriGraph.nodes.map((n) => n.id));
    for (const e of entries) {
      expect(nodes.has(e.nodeId)).toBe(true);
      expect(insideGraphArea(andheriGraph, e.point)).toBe(true);
    }
  });
});

describe('choosing any place as start or destination', () => {
  beforeEach(() => {
    useScenario.getState().selectMode('simulated');
    useTrip.getState().resetTrip();
  });

  it('plans a route to a searched road, snapped to the graph by the engine', () => {
    const road = roadNamed('chagla');
    const place = entryToPlace(road, andheriScenario.places);
    expect(isCustomPlaceId(place.id)).toBe(true);
    expect(choosePlace('to', place)).toBe('ok');
    expect(placeById(useScenario.getState().scenario, useTrip.getState().destinationId)?.name).toBe('M C Chagla Road');
    const plan = runPlanNow();
    expect(plan?.recommendedRouteId).toBeTruthy();
  });

  it('plans from a searched start (not only the demo start) to a hospital', () => {
    const road = roadNamed('nagardas');
    expect(choosePlace('from', entryToPlace(road, andheriScenario.places))).toBe('ok');
    expect(useTrip.getState().originId).toBe(road.id);
    expect(runPlanNow()?.recommendedRouteId).toBeTruthy();
  });

  it('uses the phone position as the start when it is inside the map area, and refuses it outside', () => {
    const inside = placeFromPosition({ lat: 19.1155, lng: 72.8504 });
    expect(inside.ok).toBe(true);
    if (inside.ok) {
      expect(choosePlace('from', inside.place)).toBe('ok');
      expect(runPlanNow()?.recommendedRouteId).toBeTruthy();
    }
    expect(placeFromPosition({ lat: 28.61, lng: 77.2 })).toEqual({ ok: false, reason: 'outside' });
  });

  it('refuses a start equal to the destination, and a start change during a trip', () => {
    const { destinationId } = useTrip.getState();
    const dest = placeById(useScenario.getState().scenario, destinationId)!;
    expect(choosePlace('from', dest)).toBe('same');
    expect(useTrip.getState().originId).not.toBe(dest.id);

    const road = roadNamed('chagla');
    useTrip.setState({ mode: 'en_route' });
    expect(choosePlace('from', entryToPlace(road, andheriScenario.places))).toBe('en_route');
    useTrip.setState({ mode: 'planning' });
  });
});
