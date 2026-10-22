import type * as LocationTypes from 'expo-location';

// expo-location is native: drive it with a scripted watcher.
type Listener = (loc: LocationTypes.LocationObject) => void;
let mockListener: Listener | null = null;
const mockRemoved = jest.fn();
const mockPerm = { granted: true, android: { accuracy: 'fine' as 'fine' | 'coarse' } };

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  enableNetworkProviderAsync: jest.fn(async () => undefined),
  requestForegroundPermissionsAsync: jest.fn(async () => mockPerm),
  getForegroundPermissionsAsync: jest.fn(async () => mockPerm),
  getCurrentPositionAsync: jest.fn(async () => {
    throw new Error('not used');
  }),
  watchPositionAsync: jest.fn(async (_opts: unknown, cb: Listener) => {
    mockListener = cb;
    return { remove: mockRemoved };
  }),
}));

import { accurateFix, requestLocationPermission } from '@/lib/location';
import { placeFromPosition } from '@/features/search/myLocation';
import { useUi } from '@/stores/ui';

const at = (lat: number, lng: number, accuracy: number, ageMs = 0): LocationTypes.LocationObject => ({
  coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: Date.now() - ageMs,
});

const flush = () => new Promise((r) => setImmediate(r));

describe('accurate location', () => {
  beforeEach(() => {
    mockListener = null;
    mockRemoved.mockClear();
    mockPerm.android.accuracy = 'fine';
  });

  it('returns the first fresh fix that is accurate enough, and stops listening', async () => {
    const p = accurateFix({ timeoutMs: 5000 });
    await flush();
    mockListener!(at(19.11, 72.85, 180));
    mockListener!(at(19.112, 72.852, 12));
    const fix = await p;
    expect(fix).toEqual({ lat: 19.112, lng: 72.852, accuracyM: 12 });
    expect(mockRemoved).toHaveBeenCalled();
    expect(useUi.getState().devicePosition).toEqual(fix);
  });

  it('ignores a stale cached fix, and falls back to the best fresh one at the timeout', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const p = accurateFix({ timeoutMs: 3000 });
    await flush();
    mockListener!(at(19.2, 72.9, 5, 60_000)); // a minute old: never used
    mockListener!(at(19.11, 72.85, 150));
    mockListener!(at(19.111, 72.851, 60));
    jest.advanceTimersByTime(3000);
    const fix = await p;
    jest.useRealTimers();
    expect(fix).toEqual({ lat: 19.111, lng: 72.851, accuracyM: 60 });
  });

  it('reports approximate-only permission (Android "coarse")', async () => {
    mockPerm.android.accuracy = 'coarse';
    expect(await requestLocationPermission()).toBe('approximate');
    expect(useUi.getState().locationPermission).toBe('approximate');
    mockPerm.android.accuracy = 'fine';
    expect(await requestLocationPermission()).toBe('precise');
  });

  it('marks a start as approximate when the fix is rough or the permission is coarse', () => {
    const good = placeFromPosition({ lat: 19.1155, lng: 72.8504 }, 10, false);
    const rough = placeFromPosition({ lat: 19.1155, lng: 72.8504 }, 300, false);
    const coarse = placeFromPosition({ lat: 19.1155, lng: 72.8504 }, 10, true);
    expect(good.ok && good.approximate).toBe(false);
    expect(rough.ok && rough.approximate).toBe(true);
    expect(coarse.ok && coarse.approximate).toBe(true);
  });
});
