import { townEntries, entryToPlace } from '@/features/search/gazetteer';
import { lastKnownPosition, resetStartHere, startFromHere, START_REFRESH_M, watchMyStart } from '@/features/search/startHere';
import { runPlanNow, setTripPlaces } from '@/features/trip/planner';
import { northPlaces } from '@/regions';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';

const mockCheck = jest.fn();
const mockRequest = jest.fn();
const mockFix = jest.fn();
jest.mock('@/lib/location', () => ({
  checkLocationPermission: (...a: unknown[]) => mockCheck(...a),
  requestLocationPermission: (...a: unknown[]) => mockRequest(...a),
  accurateFix: (...a: unknown[]) => mockFix(...a),
  watchAccurate: jest.fn(),
}));

const AMRITSAR = { lat: 31.6356, lng: 74.8243, accuracyM: 12 };
const ANDHERI = { lat: 19.12429, lng: 72.84673, accuracyM: 10 };
const DELHI = { lat: 28.6139, lng: 77.209, accuracyM: 10 };

function reset(live = true) {
  resetStartHere();
  mockCheck.mockReset().mockResolvedValue('precise');
  mockRequest.mockReset().mockResolvedValue('precise');
  mockFix.mockReset().mockResolvedValue(AMRITSAR);
  useSettings.getState().setDataMode(live ? 'live' : 'simulated');
  useScenario.getState().selectMode(live ? 'live' : 'simulated');
  useScenario.getState().setRegion('andheri');
  useTrip.getState().resetTrip();
  useUi.setState({ startHere: 'idle', cameraRequest: null, devicePosition: null });
}

const place = (name: string) => {
  const e = townEntries(northPlaces()).find((t) => t.name === name && t.kind === 'city')!;
  return entryToPlace(e, []);
};

describe('opening like Google Maps: where the phone is, not Andheri', () => {
  beforeEach(() => reset());

  it('in Amritsar: switches to the corridor map, starts from My location with no destination, and flies there', async () => {
    await startFromHere();
    const trip = useTrip.getState();
    expect(useScenario.getState().region).toBe('north');
    expect(trip.originId.startsWith('my-location:')).toBe(true);
    expect(placeById(useScenario.getState().scenario, trip.originId)?.name).toBe('My location');
    expect(trip.destinationId).toBeNull();
    expect(trip.plan).toBeNull();
    expect(trip.evaluating).toBe(false);
    expect(useUi.getState().startHere).toBe('ready');
    expect(useUi.getState().cameraRequest).toMatchObject({ center: { lat: AMRITSAR.lat, lng: AMRITSAR.lng }, zoom: 15 });
    // The next launch opens where this one ended.
    expect(lastKnownPosition()).toEqual({ lat: AMRITSAR.lat, lng: AMRITSAR.lng });
  });

  it('in Andheri: stays on the Andheri map, from My location, with no destination yet', async () => {
    mockFix.mockResolvedValue(ANDHERI);
    await startFromHere();
    expect(useScenario.getState().region).toBe('andheri');
    expect(useTrip.getState().originId.startsWith('my-location:')).toBe(true);
    expect(useTrip.getState().destinationId).toBeNull();
    expect(useUi.getState().startHere).toBe('ready');
  });

  it('then plans a real trip once a destination is chosen: Amritsar to Ambala by road', async () => {
    await startFromHere();
    const from = placeById(useScenario.getState().scenario, useTrip.getState().originId)!;
    expect(setTripPlaces(from, place('Ambala'))).toBe('ok');
    const plan = runPlanNow()!;
    expect(plan.noViableRoute).toBe(false);
    const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId)!;
    expect(rec.distanceM).toBeGreaterThan(235_000);
    expect(rec.distanceM).toBeLessThan(265_000);
  });

  it('somewhere with no road map: says so, still shows the phone, and leaves the maps alone', async () => {
    mockFix.mockResolvedValue(DELHI);
    const before = useTrip.getState().originId;
    await startFromHere();
    expect(useUi.getState().startHere).toBe('outside');
    expect(useUi.getState().cameraRequest?.center).toMatchObject({ lat: DELHI.lat, lng: DELHI.lng });
    expect(useTrip.getState().originId).toBe(before);
  });

  it('never asks at launch: with no permission yet it shows the Allow card, and asks only when that is pressed', async () => {
    mockCheck.mockResolvedValue('unknown');
    await startFromHere();
    expect(useUi.getState().startHere).toBe('needs_permission');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockFix).not.toHaveBeenCalled();
    await startFromHere({ ask: true, force: true });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(useUi.getState().startHere).toBe('ready');
    expect(useScenario.getState().region).toBe('north');
  });

  it('says when location is refused or cannot be read', async () => {
    mockCheck.mockResolvedValue('denied');
    await startFromHere();
    expect(useUi.getState().startHere).toBe('denied');
    reset();
    mockFix.mockRejectedValue(new Error('no fix'));
    await startFromHere();
    expect(useUi.getState().startHere).toBe('unavailable');
    expect(useTrip.getState().destinationId).not.toBeNull();
  });

  it('is only for live mode: the simulated demo keeps its own Andheri trip', async () => {
    reset(false);
    const before = { ...useTrip.getState() };
    await startFromHere();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(useTrip.getState().originId).toBe(before.originId);
    expect(useTrip.getState().destinationId).toBe(before.destinationId);
  });

  it('runs once a session and never overrides a trip the traveller already began', async () => {
    await startFromHere();
    const origin = useTrip.getState().originId;
    mockFix.mockResolvedValue(ANDHERI);
    await startFromHere();
    expect(useTrip.getState().originId).toBe(origin);

    reset();
    useTrip.getState().setDestination('somewhere-else');
    await startFromHere();
    expect(mockFix).not.toHaveBeenCalled();
    // The button (force) does start over.
    await startFromHere({ force: true });
    expect(useTrip.getState().destinationId).toBeNull();
  });
});

describe('the start follows the phone while planning', () => {
  let stop: () => void;
  beforeEach(async () => {
    reset();
    await startFromHere();
    const from = placeById(useScenario.getState().scenario, useTrip.getState().originId)!;
    setTripPlaces(from, place('Ambala'));
    stop = watchMyStart();
  });
  afterEach(() => stop());

  const moveTo = (lat: number, lng: number) => useUi.getState().setDevicePosition({ lat, lng, accuracyM: 8 });

  it('moves the start when the phone has gone further than the threshold, and keeps the destination', () => {
    const before = useTrip.getState().originId;
    moveTo(AMRITSAR.lat + 0.0005, AMRITSAR.lng); // about 55 m
    expect(useTrip.getState().originId).toBe(before);
    moveTo(AMRITSAR.lat + (START_REFRESH_M + 300) / 111_000, AMRITSAR.lng);
    expect(useTrip.getState().originId).not.toBe(before);
    expect(useTrip.getState().originId.startsWith('my-location:')).toBe(true);
    expect(useTrip.getState().destinationId).not.toBeNull();
  });

  it('ignores a poor fix and a running trip', () => {
    const before = useTrip.getState().originId;
    useUi.getState().setDevicePosition({ lat: AMRITSAR.lat + 0.01, lng: AMRITSAR.lng, accuracyM: 400 });
    expect(useTrip.getState().originId).toBe(before);
  });
});
