import type { LatLng } from '@vighnaway/contracts';
import { GEOCODER_URL } from '@/config/env';
import type { SearchKind } from './gazetteer';

/**
 * Live place search: the places the traveller types are looked up on a Photon server (OpenStreetMap
 * data) and come back with real names and addresses. It only finds places; it never routes. A result
 * is a point: the engine routes only where the app has a road map (see regions/index.ts), and the
 * sheet says plainly when a result is somewhere it has none.
 */
export interface OnlinePlace {
  /** `place:{lat}:{lng}`, the id of any searched place (the planner snaps it to a road). */
  id: string;
  name: string;
  /** Street, area, city and state, as the data has them. */
  subtitle: string;
  kind: SearchKind;
  point: LatLng;
}

/** India, with a margin: the app is for Indian roads, so results elsewhere are noise. */
const INDIA_BBOX = { west: 68.1, south: 6.7, east: 97.4, north: 35.7 };
/** Results asked for, and kept after de-duplication. */
export const ONLINE_LIMIT = 8;
const TIMEOUT_MS = 8000;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/g;
/** Plain text only: control characters out, one line, a sane length. */
const plain = (v: unknown, max = 120): string => (typeof v === 'string' ? v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** What a result is, from its OpenStreetMap key and value, for its icon. */
export function kindOf(key: string, value: string): SearchKind {
  if (key === 'place') return value === 'city' ? 'city' : value === 'town' ? 'town' : value === 'village' || value === 'hamlet' || value === 'suburb' || value === 'neighbourhood' ? 'village' : 'poi';
  if (key === 'highway') return 'road';
  if (key === 'aeroway') return 'airport';
  if (key === 'railway' || key === 'public_transport' || value === 'bus_station' || value === 'bus_stop') return 'station';
  if (key === 'shop') return 'shop';
  if (key === 'amenity') return value === 'hospital' || value === 'clinic' || value === 'doctors' ? 'hospital' : value === 'school' || value === 'college' || value === 'university' ? 'school' : 'poi';
  if (key === 'healthcare') return 'hospital';
  if (key === 'tourism' || key === 'historic') return 'landmark';
  return 'poi';
}

const inIndia = (p: LatLng): boolean => p.lat >= INDIA_BBOX.south && p.lat <= INDIA_BBOX.north && p.lng >= INDIA_BBOX.west && p.lng <= INDIA_BBOX.east;
const keyOf = (p: LatLng): string => `place:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`;

interface PhotonProps {
  name?: unknown;
  street?: unknown;
  housenumber?: unknown;
  district?: unknown;
  locality?: unknown;
  city?: unknown;
  county?: unknown;
  state?: unknown;
  osm_key?: unknown;
  osm_value?: unknown;
}

/** Street, area, city and state, without repeating the name or each other. */
function addressOf(p: PhotonProps, name: string): string {
  const street = [plain(p.housenumber, 12), plain(p.street, 60)].filter(Boolean).join(' ');
  const parts = [street, plain(p.locality, 50) || plain(p.district, 50), plain(p.city, 50) || plain(p.county, 50), plain(p.state, 50)];
  const seen = new Set([name.toLowerCase()]);
  const out: string[] = [];
  for (const part of parts) {
    const k = part.toLowerCase();
    if (!part || seen.has(k)) continue;
    seen.add(k);
    out.push(part);
  }
  return out.slice(0, 3).join(', ');
}

/** Turns a Photon (GeoJSON) answer into places. Anything malformed or outside India is dropped. */
export function parsePhoton(json: unknown): OnlinePlace[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: OnlinePlace[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const coords = (f as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
    if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;
    const point = { lat: coords[1], lng: coords[0] };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !inIndia(point)) continue;
    const props = ((f as { properties?: unknown }).properties ?? {}) as PhotonProps;
    const name = plain(props.name) || plain(props.street);
    if (!name) continue;
    // The same place often comes back once per OSM object (a station as a node and as an area).
    const dedupe = `${name.toLowerCase()}|${point.lat.toFixed(3)}|${point.lng.toFixed(3)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      id: keyOf(point),
      name,
      subtitle: addressOf(props, name),
      kind: kindOf(plain(props.osm_key, 40), plain(props.osm_value, 40)),
      point,
    });
    if (out.length >= ONLINE_LIMIT) break;
  }
  return out;
}

/** The request URL. The bias is rounded to about 10 km, so the server never learns an exact position. */
export function searchUrl(base: string, query: string, bias: LatLng | null): string {
  const q = encodeURIComponent(query.trim().slice(0, 80));
  const b = INDIA_BBOX;
  const bias1 = bias ? `&lat=${bias.lat.toFixed(1)}&lon=${bias.lng.toFixed(1)}&location_bias_scale=0.3` : '';
  return `${base}/api/?q=${q}&limit=${ONLINE_LIMIT + 4}&lang=en&bbox=${b.west},${b.south},${b.east},${b.north}${bias1}`;
}

/** Looks the query up. Throws on a network failure, a timeout or an HTTP error: the caller shows the built-in places then. */
export async function searchOnline(query: string, bias: LatLng | null, signal?: AbortSignal, base: string = GEOCODER_URL, fetchImpl: typeof fetch = fetch): Promise<OnlinePlace[]> {
  if (!base) return [];
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetchImpl(searchUrl(base, query, bias), { headers: { Accept: 'application/json' }, signal: timeout.signal });
    if (!res.ok) throw new Error(`Place search answered ${res.status}`);
    return parsePhoton(await res.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
