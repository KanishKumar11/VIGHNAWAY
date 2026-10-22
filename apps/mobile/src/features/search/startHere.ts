import { haversineM } from '@vighnaway/engine';
import type { LatLng } from '@vighnaway/contracts';
import { setStartOnly, schedulePlan } from '@/features/trip/planner';
import { accurateFix, checkLocationPermission, requestLocationPermission } from '@/lib/location';
import { KEYS, storage } from '@/lib/storage';
import { regionOfPoint } from '@/regions';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useTrip } from '@/stores/trip';
import { useUi, type DevicePosition } from '@/stores/ui';
import { placeFromPosition } from './myLocation';

/**
 * Opening the app like Google Maps (live mode): the map goes to where the phone is, the trip starts
 * from there, and the traveller is asked where to. Which road map applies follows from the position:
 * Andheri, the Amritsar to Ambala corridor, or none (the phone is somewhere with no road map yet, and
 * the app says so instead of showing another city).
 */

/** How far (m) the phone moves before a "My location" start is refreshed. */
export const START_REFRESH_M = 200;
const START_REFRESH_MIN_MS = 15_000;
/** The map opens on the phone this close (zoom level), enough to see the streets around. */
export const HERE_ZOOM = 15;

/** The last position the phone had, kept on the phone only, so the next launch opens where you were. */
export const lastKnownPosition = (): LatLng | null => {
  const p = storage.getJSON<LatLng>(KEYS.lastFix);
  return p && typeof p.lat === 'number' && typeof p.lng === 'number' ? p : null;
};
const rememberPosition = (p: LatLng): void => storage.setJSON(KEYS.lastFix, { lat: p.lat, lng: p.lng });

let autoTried = false;
/** For tests: forget that the automatic start already ran in this session. */
export const resetStartHere = (): void => {
  autoTried = false;
};

/**
 * Finds the phone and starts a trip from it with no destination. Without `force` it runs once per
 * session and never overrides a trip the traveller already began. `ask` is for a button the traveller
 * pressed: only then may the permission dialog appear.
 */
export async function startFromHere({ ask = false, force = false }: { ask?: boolean; force?: boolean } = {}): Promise<void> {
  if (useSettings.getState().dataMode !== 'live') return;
  if (!force && autoTried) return;
  autoTried = true;
  const ui = useUi.getState();
  const begin = useTrip.getState();
  if (begin.mode !== 'planning') return;
  const demo = useScenario.getState().scenario.demoTrip;
  const pristine = begin.originId === demo.originId && begin.destinationId === demo.destinationId;
  if (!force && !pristine) return;

  const permission = ask ? await requestLocationPermission() : await checkLocationPermission();
  if (permission === 'unknown') {
    ui.setStartHere('needs_permission');
    return;
  }
  if (permission === 'denied') {
    ui.setStartHere('denied');
    return;
  }
  ui.setStartHere('locating');
  let fix;
  try {
    fix = await accurateFix();
  } catch {
    useUi.getState().setStartHere('unavailable');
    return;
  }
  rememberPosition(fix);
  useUi.getState().setDevicePosition(fix);
  useUi.getState().requestCamera(fix, HERE_ZOOM);
  // The traveller may have begun a trip while the phone was being found: leave it alone.
  if (!force && useTrip.getState().mode !== 'planning') return;
  const r = placeFromPosition(fix, fix.accuracyM, permission === 'approximate');
  if (!r.ok) {
    useUi.getState().setStartHere('outside');
    return;
  }
  setStartOnly(r.place);
  useUi.getState().setStartHere('ready');
}

/**
 * Keeps a "My location" start in step with the phone while the traveller is still planning: when the
 * phone has moved more than START_REFRESH_M the start follows it, and re-plans if there is a
 * destination. If it has crossed into another road map the whole start is redone there.
 */
export function watchMyStart(): () => void {
  let last = 0;
  return useUi.subscribe((s, prev) => {
    const p: DevicePosition | null = s.devicePosition;
    if (!p || p === prev.devicePosition) return;
    if (useSettings.getState().dataMode !== 'live') return;
    const trip = useTrip.getState();
    if (trip.mode !== 'planning' || !trip.originId.startsWith('my-location:')) return;
    if (Date.now() - last < START_REFRESH_MIN_MS) return;
    if (p.accuracyM !== null && p.accuracyM > 100) return;
    const origin = placeById(useScenario.getState().scenario, trip.originId);
    if (!origin || haversineM(origin.point, p) < START_REFRESH_M) return;
    last = Date.now();
    const r = placeFromPosition(p, p.accuracyM);
    if (!r.ok) return;
    if (regionOfPoint(r.place.point) !== useScenario.getState().region) {
      void startFromHere({ force: true });
      return;
    }
    trip.setOrigin(r.place.id);
    trip.setAccess(null);
    if (trip.destinationId) schedulePlan({ showEvaluating: false, delayMs: 0 });
  });
}
