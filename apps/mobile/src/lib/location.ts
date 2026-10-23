import * as Location from 'expo-location';
import type { LatLng } from '@vighnaway/contracts';
import { useUi, type LocationPermission } from '@/stores/ui';

/** A position with its reported accuracy radius in metres (null when the platform gives none). */
export interface Fix extends LatLng {
  accuracyM: number | null;
  /** GPS direction of travel (degrees from north) and speed; null when the platform has none. */
  courseDeg?: number | null;
  speedMps?: number | null;
}

/** Below this speed the GPS course is noise (standing still, or a phone swaying in a hand). */
export const MIN_COURSE_MPS = 1;

/** A fix this good is accepted at once (typical GPS outdoors is 5–15 m). */
export const GOOD_FIX_M = 25;
/** Fixes older than this are ignored: a cached position can be far from where the phone is now. */
const MAX_FIX_AGE_MS = 30_000;
/** Precise permission on Android 12+ is "fine"; "coarse" positions are only accurate to about 2 km. */
const preciseOf = (p: Location.LocationPermissionResponse): boolean =>
  p.android ? p.android.accuracy === 'fine' : p.ios ? p.ios.accuracy !== 'reduced' : true;

function remember(p: Location.LocationPermissionResponse): LocationPermission {
  const state: LocationPermission = !p.granted ? 'denied' : preciseOf(p) ? 'precise' : 'approximate';
  useUi.getState().setLocationPermission(state);
  return state;
}

/** Reads the current permission without asking (for showing the map's location dot). */
export async function checkLocationPermission(): Promise<LocationPermission> {
  try {
    return remember(await Location.getForegroundPermissionsAsync());
  } catch {
    return 'denied';
  }
}

/** Asks for foreground location (only when the traveller needs it) and reports precise vs approximate. */
export async function requestLocationPermission(): Promise<LocationPermission> {
  try {
    return remember(await Location.requestForegroundPermissionsAsync());
  } catch {
    return 'denied';
  }
}

let providerAsked = false;

/**
 * The most accurate position available within `timeoutMs`: listens at the highest accuracy and
 * returns as soon as a fresh fix is within `goodEnoughM`, otherwise the best fresh fix seen.
 * Android is asked once per session to turn on high-accuracy location if it is off.
 */
export async function accurateFix({ timeoutMs = 12_000, goodEnoughM = GOOD_FIX_M }: { timeoutMs?: number; goodEnoughM?: number } = {}): Promise<Fix> {
  if (!providerAsked) {
    providerAsked = true;
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // Declined or unavailable: GPS alone still works outdoors.
    }
  }
  return new Promise<Fix>((resolve, reject) => {
    let best: Fix | null = null;
    let done = false;
    let sub: Location.LocationSubscription | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.remove();
      if (best) resolve(best);
      else reject(new Error('no location fix'));
    };
    const consider = (loc: Location.LocationObject) => {
      if (Date.now() - loc.timestamp > MAX_FIX_AGE_MS) return;
      const fix: Fix = { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracyM: loc.coords.accuracy ?? null };
      useUi.getState().setDevicePosition(fix);
      if (!best || (fix.accuracyM ?? Infinity) < (best.accuracyM ?? Infinity)) best = fix;
      if ((fix.accuracyM ?? Infinity) <= goodEnoughM) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, consider)
      .then((s) => {
        sub = s;
        if (done) s.remove();
      })
      .catch(() => {
        // Watching failed (services off): one direct high-accuracy read before giving up.
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest })
          .then(consider)
          .catch(() => undefined)
          .finally(finish);
      });
  });
}

/** Continuous high-accuracy updates for a trip that follows the phone. */
export function watchAccurate(onFix: (f: Fix) => void): Promise<Location.LocationSubscription> {
  return Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 }, (loc) => {
    const fix: Fix = { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracyM: loc.coords.accuracy ?? null, courseDeg: loc.coords.heading ?? null, speedMps: loc.coords.speed ?? null };
    useUi.getState().setDevicePosition({ lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM });
    // The arrow turns only when the phone really moves; standing still keeps the last direction.
    if (fix.courseDeg != null && fix.courseDeg >= 0 && (fix.speedMps ?? 0) >= MIN_COURSE_MPS) useUi.getState().setDeviceCourse(Math.round(fix.courseDeg));
    onFix(fix);
  });
}
