import type * as Location from 'expo-location';
import { snapToEdge } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { getGraph } from '@/lib/engine';
import { requestLocationPermission, watchAccurate, type Fix } from '@/lib/location';
import { useActivity } from '@/stores/activity';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useTrip } from '@/stores/trip';
import { startTrip } from './planner';

/** A position further than this from the route is treated as off the route (not snapped). */
const SNAP_MAX_M = 60;
/** Fixes less certain than this are skipped, so the trip never jumps on a poor reading. */
const MAX_TRIP_FIX_M = 75;

let watcher: Location.LocationSubscription | null = null;
let unsubTrip: (() => void) | null = null;

export function stopFollowing(): void {
  watcher?.remove();
  watcher = null;
  unsubTrip?.();
  unsubTrip = null;
}

/**
 * Moves the trip's vehicle to the device position when it lies on the route ahead. The snap
 * distance grows with the fix's own uncertainty (never past MAX_TRIP_FIX_M).
 */
function onPosition({ lat, lng, accuracyM }: Fix): void {
  const trip = useTrip.getState();
  if (trip.mode !== 'en_route' || !trip.vehicle) return;
  if (accuracyM !== null && accuracyM > MAX_TRIP_FIX_M) return;
  const snapMaxM = Math.max(SNAP_MAX_M, accuracyM ?? 0);
  const graph = getGraph(useScenario.getState().graphFile, useSettings.getState().profile);
  const ahead = trip.vehicle.edgeIds.slice(trip.vehicle.index);
  const snap = snapToEdge(graph, { lat, lng }, ahead);
  if (!snap || snap.distanceM > snapMaxM) return;
  const index = trip.vehicle.edgeIds.indexOf(snap.edgeId, trip.vehicle.index);
  if (index < 0) return;
  const last = index === trip.vehicle.edgeIds.length - 1;
  const arrived = last && snap.fraction > 0.95;
  trip.setVehicle({ ...trip.vehicle, index, fraction: snap.fraction, arrived }, useSim.getState().simTimeS);
  if (arrived) {
    stopFollowing();
    trip.arrive();
    const place = placeById(useScenario.getState().scenario, trip.destinationId);
    useActivity.getState().add({ atS: useSim.getState().simTimeS, kind: 'trip', text: t('activityArrived', { place: place?.name ?? '' }) });
  }
}

/**
 * Start trip. Simulated mode: the simulated vehicle sets off on the sim clock. Live mode: no
 * simulated vehicle; the trip follows the phone's location (foreground only). Without location
 * permission the route stays a planned route, and the sheet says so.
 */
export async function beginTrip(): Promise<void> {
  if (useSettings.getState().dataMode !== 'live') {
    startTrip();
    return;
  }
  const permission = await requestLocationPermission();
  if (permission === 'denied' || permission === 'unknown') {
    useTrip.getState().setLiveLocation('denied');
    return;
  }
  startTrip();
  useTrip.getState().setLiveLocation('following');
  stopFollowing();
  try {
    // Highest accuracy, every second: the trip follows the phone closely (foreground only).
    watcher = await watchAccurate(onPosition);
  } catch {
    useTrip.getState().setLiveLocation('denied');
  }
  unsubTrip = useTrip.subscribe((s, prev) => {
    if (prev.mode === 'en_route' && s.mode !== 'en_route') stopFollowing();
  });
}
