import * as Location from 'expo-location';
import { snapToEdge } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { getGraph } from '@/lib/engine';
import { useActivity } from '@/stores/activity';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useTrip } from '@/stores/trip';
import { startTrip } from './planner';

/** A position further than this from the route is treated as off the route (not snapped). */
const SNAP_MAX_M = 60;

let watcher: Location.LocationSubscription | null = null;
let unsubTrip: (() => void) | null = null;

export function stopFollowing(): void {
  watcher?.remove();
  watcher = null;
  unsubTrip?.();
  unsubTrip = null;
}

/** Moves the trip's vehicle to the device position when it lies on the route ahead. */
function onPosition(lat: number, lng: number): void {
  const trip = useTrip.getState();
  if (trip.mode !== 'en_route' || !trip.vehicle) return;
  const graph = getGraph(useScenario.getState().graphFile, useSettings.getState().profile);
  const ahead = trip.vehicle.edgeIds.slice(trip.vehicle.index);
  const snap = snapToEdge(graph, { lat, lng }, ahead);
  if (!snap || snap.distanceM > SNAP_MAX_M) return;
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
  let granted = false;
  try {
    granted = (await Location.requestForegroundPermissionsAsync()).granted;
  } catch {
    granted = false;
  }
  if (!granted) {
    useTrip.getState().setLiveLocation('denied');
    return;
  }
  startTrip();
  useTrip.getState().setLiveLocation('following');
  stopFollowing();
  try {
    watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 3000 }, (loc) =>
      onPosition(loc.coords.latitude, loc.coords.longitude),
    );
  } catch {
    useTrip.getState().setLiveLocation('denied');
  }
  unsubTrip = useTrip.subscribe((s, prev) => {
    if (prev.mode === 'en_route' && s.mode !== 'en_route') stopFollowing();
  });
}
