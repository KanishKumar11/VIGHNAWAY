import type { GraphFile, LatLng, Place } from '@vighnaway/contracts';
import { snapToNode } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { getGraph } from '@/lib/engine';
import { accurateFix, checkLocationPermission, requestLocationPermission } from '@/lib/location';
import { graphForRegion, regionOfPoint } from '@/regions';
import { registerCustomPlace } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';

/** A position this far outside the graph's bounding box (about 330 m) still counts as inside. */
const BBOX_MARGIN_DEG = 0.003;
/** A start this uncertain is still used, but the traveller is told it is approximate. */
export const APPROXIMATE_FIX_M = 100;

export type MyLocationResult =
  | { ok: true; place: Place; accuracyM: number | null; approximate: boolean }
  | { ok: false; reason: 'denied' | 'outside' | 'unavailable' };

export function insideGraphArea(file: GraphFile, p: LatLng): boolean {
  const b = file.bbox;
  return p.lat >= b.south - BBOX_MARGIN_DEG && p.lat <= b.north + BBOX_MARGIN_DEG && p.lng >= b.west - BBOX_MARGIN_DEG && p.lng <= b.east + BBOX_MARGIN_DEG;
}

/**
 * The phone's position as a start place, snapped onto the road graph. `approximate` is set when the
 * permission is approximate-only or the fix is worse than APPROXIMATE_FIX_M.
 */
export function placeFromPosition(p: LatLng, accuracyM: number | null = null, coarsePermission = false): MyLocationResult {
  // Wherever the phone is, if it is inside a mapped region (Andheri, or the Amritsar to Ambala corridor).
  const region = regionOfPoint(p);
  if (!region) return { ok: false, reason: 'outside' };
  const nodeId = snapToNode(getGraph(graphForRegion(region), useSettings.getState().profile), p);
  if (!nodeId) return { ok: false, reason: 'outside' };
  // The rounded position (about 1 m) is part of the id, so a new position is a new trip context.
  const id = `my-location:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`;
  const place = registerCustomPlace({ id, name: t('myLocation'), kind: 'origin', point: { lat: p.lat, lng: p.lng }, nodeId, side: null, address: null });
  return { ok: true, place, accuracyM, approximate: coarsePermission || (accuracyM !== null && accuracyM > APPROXIMATE_FIX_M) };
}

/** Asks (when `ask`) for location, waits for an accurate fix and returns it as a start place. */
export async function resolveMyLocation({ ask = true }: { ask?: boolean } = {}): Promise<MyLocationResult> {
  try {
    const perm = ask ? await requestLocationPermission() : await checkLocationPermission();
    if (perm === 'denied' || perm === 'unknown') return { ok: false, reason: 'denied' };
    const fix = await accurateFix();
    return placeFromPosition(fix, fix.accuracyM, perm === 'approximate');
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
