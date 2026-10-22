import { runPlanNow, setTripPlaces } from '@/features/trip/planner';
import { buildGazetteer, entryToPlace, searchEntries, townEntries, type SearchEntry } from '@/features/search/gazetteer';
import { graphForRegion, northPlaces, regionOfPoint } from '@/regions';
import { placeById, useScenario } from '@/stores/scenario';
import { recommendedRoute, useTrip } from '@/stores/trip';

/**
 * The Amritsar to Ambala corridor: real OpenStreetMap roads through the same engine as Andheri.
 * These tests drive the real stores and the real graph (about 11 MB), no mocks of the engine.
 */
const towns = townEntries(northPlaces());
const entry = (name: string): SearchEntry => {
  const e = towns.find((t) => t.name === name && t.kind === 'city');
  if (!e) throw new Error(`no corridor city ${name}`);
  return e;
};
const place = (name: string) => entryToPlace(entry(name), []);

describe('regions', () => {
  it('tells which map a point is on', () => {
    expect(regionOfPoint({ lat: 31.6356, lng: 74.8243 })).toBe('north'); // Amritsar
    expect(regionOfPoint({ lat: 30.3844, lng: 76.7704 })).toBe('north'); // Ambala
    expect(regionOfPoint({ lat: 19.1197, lng: 72.8468 })).toBe('andheri');
    expect(regionOfPoint({ lat: 28.6139, lng: 77.209 })).toBeNull(); // Delhi: no map
  });

  it('loads a connected roads-only corridor graph from OpenStreetMap', () => {
    const g = graphForRegion('north');
    expect(g.source).toBe('osm');
    expect(g.attribution).toMatch(/OpenStreetMap/);
    expect(g.speedsKmh?.car?.trunk).toBeGreaterThan(40);
    expect(g.edges.length).toBeGreaterThan(10_000);
  });
});

describe('searching the corridor', () => {
  it('finds cities by name, ahead of Andheri roads', () => {
    const entries = buildGazetteer(graphForRegion('andheri'), [], northPlaces());
    const hit = searchEntries(entries, 'ambala')[0];
    expect(hit?.name).toBe('Ambala');
    expect(hit?.kind).toBe('city');
    expect(hit?.id.startsWith('place:')).toBe(true);
  });

  it('suggests the larger places, not every village', () => {
    const entries = buildGazetteer(graphForRegion('andheri'), [], northPlaces());
    const suggested = searchEntries(entries, '');
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.some((e) => e.kind === 'village')).toBe(false);
  });
});

describe('a trip from Amritsar to Ambala', () => {
  afterEach(() => {
    useScenario.getState().setRegion('andheri');
    useTrip.getState().resetTrip();
  });

  it('plans real road routes: about 250 km by car, with no incident data', () => {
    const from = place('Amritsar');
    const to = place('Ambala');
    expect(setTripPlaces(from, to)).toBe('ok');
    expect(useScenario.getState().region).toBe('north');
    expect(placeById(useScenario.getState().scenario, useTrip.getState().originId)?.name).toBe('Amritsar');

    const plan = runPlanNow()!;
    expect(plan.noViableRoute).toBe(false);
    expect(plan.incidentCount).toBe(0);
    const rec = recommendedRoute(useTrip.getState().plan)!;
    // Google Maps puts this drive near 240 km; the graph's roads give a figure in that range.
    expect(rec.distanceM).toBeGreaterThan(235_000);
    expect(rec.distanceM).toBeLessThan(265_000);
    // Typical speeds on trunk roads: well under 6 hours, over 3.
    expect(rec.etaS).toBeGreaterThan(3 * 3600);
    expect(rec.etaS).toBeLessThan(6 * 3600);
    expect(rec.name).toMatch(/NH ?44|Grand Trunk/);
    expect(plan.routes.length).toBeGreaterThanOrEqual(2);
  });

  it('plans the same drive in the other direction within a few percent', () => {
    expect(setTripPlaces(place('Ambala'), place('Amritsar'))).toBe('ok');
    const back = recommendedRoute(runPlanNow() && useTrip.getState().plan)!;
    expect(back.distanceM).toBeGreaterThan(235_000);
    expect(back.distanceM).toBeLessThan(265_000);
  });

  it('refuses a start and a destination on different maps', () => {
    const kokilaben = useScenario.getState().scenario.places.find((p) => p.kind === 'hospital')!;
    expect(setTripPlaces(place('Amritsar'), kokilaben)).toBe('different_regions');
    expect(useScenario.getState().region).toBe('andheri');
  });

  it('refuses a place with no map at all', () => {
    const delhi = { ...place('Ambala'), id: 'place:28.61390:77.20900', name: 'Delhi', point: { lat: 28.6139, lng: 77.209 } };
    expect(setTripPlaces(place('Amritsar'), delhi)).toBe('outside');
  });

  it('goes back to Andheri when both ends are there', () => {
    expect(setTripPlaces(place('Amritsar'), place('Ambala'))).toBe('ok');
    const places = useScenario.getState().scenario.places;
    const [a, b] = places.filter((p) => p.kind === 'hospital' || p.kind === 'origin');
    expect(setTripPlaces(a!, b!)).toBe('ok');
    expect(useScenario.getState().region).toBe('andheri');
    expect(useTrip.getState().plan).toBeNull();
  });
});
