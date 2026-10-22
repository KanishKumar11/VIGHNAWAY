import * as Location from 'expo-location';
import type { GraphFile, LatLng, Place } from '@vighnaway/contracts';
import { snapToNode } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { getGraph } from '@/lib/engine';
import { registerCustomPlace, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';

/** A position this far outside the graph's bounding box (about 330 m) still counts as inside. */
const BBOX_MARGIN_DEG = 0.003;

export type MyLocationResult = { ok: true; place: Place } | { ok: false; reason: 'denied' | 'outside' | 'unavailable' };

export function insideGraphArea(file: GraphFile, p: LatLng): boolean {
  const b = file.bbox;
  return p.lat >= b.south - BBOX_MARGIN_DEG && p.lat <= b.north + BBOX_MARGIN_DEG && p.lng >= b.west - BBOX_MARGIN_DEG && p.lng <= b.east + BBOX_MARGIN_DEG;
}

/** The phone's position as a start place, snapped onto the road graph. Foreground permission only. */
export function placeFromPosition(p: LatLng): MyLocationResult {
  const { graphFile } = useScenario.getState();
  if (!insideGraphArea(graphFile, p)) return { ok: false, reason: 'outside' };
  const nodeId = snapToNode(getGraph(graphFile, useSettings.getState().profile), p);
  if (!nodeId) return { ok: false, reason: 'outside' };
  // The rounded position is part of the id, so a new position is a new trip context.
  const id = `my-location:${p.lat.toFixed(4)}:${p.lng.toFixed(4)}`;
  return { ok: true, place: registerCustomPlace({ id, name: t('myLocation'), kind: 'origin', point: p, nodeId, side: null, address: null }) };
}

export async function resolveMyLocation(): Promise<MyLocationResult> {
  try {
    if (!(await Location.requestForegroundPermissionsAsync()).granted) return { ok: false, reason: 'denied' };
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return placeFromPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
