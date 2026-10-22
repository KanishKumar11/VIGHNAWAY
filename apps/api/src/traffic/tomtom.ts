import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CongestionLevel, FeedRef, IncidentStatus, IncidentType, Severity } from '@vighnaway/contracts';

/**
 * TomTom Traffic Incident Details v5 (one request covers the whole scenario bounding box):
 * GET {base}/traffic/services/5/incidentDetails?key=..&bbox=minLon,minLat,maxLon,maxLat&fields=..
 *
 * The feed is evidence, never a router: each TomTom incident becomes (at most) one VIGHNAWAY
 * incident on the graph edges it lies on, and the engine's normal rules decide what it means.
 */

export const TOMTOM_FIELDS =
  '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,aci{probabilityOfOccurrence,numberOfReports,lastReportTime}}}}';

const Coord = z.tuple([z.number(), z.number()]).rest(z.number());

export const TomTomIncidentSchema = z.object({
  type: z.string().optional(),
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('Point'), coordinates: Coord }),
    z.object({ type: z.literal('LineString'), coordinates: z.array(Coord).min(2) }),
  ]),
  properties: z.object({
    id: z.string().optional(),
    iconCategory: z.number().int().optional(),
    magnitudeOfDelay: z.number().int().min(0).max(4).optional(),
    events: z
      .array(z.object({ description: z.string().nullish(), code: z.number().nullish(), iconCategory: z.number().nullish() }))
      .nullish(),
    startTime: z.string().nullish(),
    endTime: z.string().nullish(),
    from: z.string().nullish(),
    to: z.string().nullish(),
    length: z.number().nullish(),
    delay: z.number().nullish(),
    roadNumbers: z.array(z.string()).nullish(),
    aci: z
      .object({
        probabilityOfOccurrence: z.enum(['certain', 'probable', 'risk_of', 'improbable']).nullish(),
        numberOfReports: z.number().nullish(),
        lastReportTime: z.string().nullish(),
      })
      .nullish(),
  }),
});
export type TomTomIncident = z.infer<typeof TomTomIncidentSchema>;

export const TomTomResponseSchema = z.object({ incidents: z.array(z.unknown()).default([]) });

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export class TomTomError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/** Fetches current incidents in the box. The key is sent as a query parameter and never logged. */
export async function fetchTomTomIncidents(opts: {
  baseUrl: string;
  key: string;
  bbox: Bbox;
  timeoutMs?: number;
  language?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ incidents: TomTomIncident[]; invalid: number }> {
  const url = new URL('/traffic/services/5/incidentDetails', opts.baseUrl);
  const b = opts.bbox;
  url.searchParams.set('key', opts.key);
  url.searchParams.set('bbox', [b.minLon, b.minLat, b.maxLon, b.maxLat].map((n) => n.toFixed(6)).join(','));
  url.searchParams.set('fields', TOMTOM_FIELDS);
  url.searchParams.set('language', opts.language ?? 'en-GB');
  url.searchParams.set('timeValidityFilter', 'present');
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000), headers: { Accept: 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'TimeoutError' ? 'timed out' : err.message) : String(err);
    throw new TomTomError(`TomTom request failed: ${msg}`, null);
  }
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 401 ? ' (check TOMTOM_API_KEY and that Traffic API is enabled for it)' : '';
    throw new TomTomError(`TomTom answered ${res.status}${hint}`, res.status);
  }
  const body = TomTomResponseSchema.safeParse(await res.json().catch(() => null));
  if (!body.success) throw new TomTomError('TomTom response was not in the expected format', res.status);
  const incidents: TomTomIncident[] = [];
  let invalid = 0;
  for (const raw of body.data.incidents) {
    const parsed = TomTomIncidentSchema.safeParse(raw);
    if (parsed.success) incidents.push(parsed.data);
    else invalid++;
  }
  return { incidents, invalid };
}

/** What one TomTom incident means for VIGHNAWAY, before matching it to graph edges. */
export interface FeedHazard {
  externalId: string;
  type: IncidentType;
  status: Extract<IncidentStatus, 'unverified' | 'corroborated'>;
  congestion: CongestionLevel | null;
  severity: Severity | null;
  impassable: boolean;
  /** Directional hazards only match edges travelling the same way as the feed geometry. */
  directional: boolean;
  /** [lng, lat] */
  coordinates: [number, number][];
  feed: Omit<FeedRef, 'lastSeenAtS'>;
}

const MAGNITUDE_CONGESTION: Record<number, CongestionLevel> = { 0: 'moderate', 1: 'moderate', 2: 'heavy', 3: 'standstill', 4: 'standstill' };
const MAGNITUDE_SEVERITY: Record<number, Severity> = { 0: 'medium', 1: 'low', 2: 'medium', 3: 'high', 4: 'high' };

/**
 * TomTom icon categories mapped to VIGHNAWAY incident types. Weather-only categories (fog, rain,
 * ice, wind, dangerous conditions, unknown) are skipped: they describe an area, not a road
 * condition our rules can weigh.
 */
export const TOMTOM_CATEGORY_MAP: Record<number, string> = {
  1: 'accident',
  6: 'congestion (jam)',
  7: 'congestion (lane closed)',
  8: 'closure',
  9: 'congestion (road works)',
  11: 'flood',
  14: 'debris (broken-down vehicle)',
};

const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);

/**
 * Maps one TomTom incident, or returns null when it is skipped: unsupported category, or a
 * probability of "risk_of" / "improbable". "certain" counts like corroboration (an independent,
 * named, automated source; only operators set Verified); "probable" or unknown stays Unverified.
 */
export function mapTomTomIncident(i: TomTomIncident): FeedHazard | null {
  const p = i.properties;
  const probability = p.aci?.probabilityOfOccurrence ?? null;
  if (probability === 'risk_of' || probability === 'improbable') return null;
  const magnitude = p.magnitudeOfDelay ?? 0;
  const category = p.iconCategory ?? 0;
  let type: IncidentType;
  let congestion: CongestionLevel | null = null;
  let severity: Severity | null = null;
  let impassable = false;
  let directional = false;
  switch (category) {
    case 1:
      type = 'accident';
      severity = MAGNITUDE_SEVERITY[magnitude] ?? 'medium';
      impassable = magnitude === 4;
      directional = true;
      break;
    case 6:
      type = 'congestion';
      congestion = MAGNITUDE_CONGESTION[magnitude] ?? 'moderate';
      directional = true;
      break;
    case 7:
    case 9:
      type = 'congestion';
      congestion = magnitude >= 2 ? 'heavy' : 'moderate';
      directional = true;
      break;
    case 8:
      type = 'closure';
      impassable = true;
      break;
    case 11:
      type = 'flood';
      break;
    case 14:
      type = 'debris';
      severity = 'low';
      directional = true;
      break;
    default:
      return null;
  }
  const coordinates: [number, number][] =
    i.geometry.type === 'Point'
      ? [[i.geometry.coordinates[0], i.geometry.coordinates[1]]]
      : i.geometry.coordinates.map((c) => [c[0], c[1]] as [number, number]);
  const externalId =
    p.id ??
    `anon-${createHash('sha1').update(JSON.stringify([category, coordinates])).digest('hex').slice(0, 16)}`;
  const description = p.events?.map((e) => e.description).filter(Boolean).join('; ') || null;
  return {
    externalId,
    type,
    status: probability === 'certain' ? 'corroborated' : 'unverified',
    congestion,
    severity,
    impassable,
    directional,
    coordinates,
    feed: {
      provider: 'tomtom',
      externalId: externalId.slice(0, 200),
      delayS: typeof p.delay === 'number' && p.delay >= 0 ? Math.round(p.delay) : null,
      magnitude,
      probability,
      description: clip(description, 300),
      from: clip(p.from, 200),
      to: clip(p.to, 200),
    },
  };
}

/** Stable VIGHNAWAY incident id for a TomTom incident (TomTom ids may contain any character). */
export function feedIncidentId(scenarioId: string, externalId: string): string {
  return `${scenarioId}:feed:tomtom:${createHash('sha1').update(externalId).digest('hex').slice(0, 16)}`;
}

// --- geometry helpers for matching (equirectangular; fine at city scale) ---

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function bearing(a: [number, number], b: [number, number]): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const angleBetween = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Distance in metres from p to segment ab, and the segment's bearing. */
function toSegment(p: [number, number], a: [number, number], b: [number, number]): { d: number; brg: number } {
  const kx = Math.cos(rad((a[1] + b[1]) / 2)) * (Math.PI / 180) * R;
  const ky = (Math.PI / 180) * R;
  const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx - ax, by = b[1] * ky - ay;
  const px = p[0] * kx - ax, py = p[1] * ky - ay;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return { d: Math.hypot(px - t * bx, py - t * by), brg: bearing(a, b) };
}

/** Nearest segment of a polyline to a point: distance and that segment's bearing. */
export function nearestOnLine(p: [number, number], line: readonly [number, number][]): { d: number; brg: number } {
  if (line.length === 1) {
    const q = line[0]!;
    return { d: toSegment(p, q, q).d, brg: NaN };
  }
  let best = { d: Infinity, brg: NaN };
  for (let i = 1; i < line.length; i++) {
    const s = toSegment(p, line[i - 1]!, line[i]!);
    if (s.d < best.d) best = s;
  }
  return best;
}

/** Point at a fraction of a polyline's length (equirectangular). */
export function pointAt(line: readonly [number, number][], f: number): [number, number] {
  if (line.length === 1) return line[0]!;
  const k = Math.cos(rad(line[0]![1]));
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = Math.hypot((line[i]![0] - line[i - 1]![0]) * k, line[i]![1] - line[i - 1]![1]);
    seg.push(d);
    total += d;
  }
  let target = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]! || i === seg.length - 1) {
      const t = seg[i]! === 0 ? 0 : Math.min(1, target / seg[i]!);
      const a = line[i]!, b = line[i + 1]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    target -= seg[i]!;
  }
  return line[line.length - 1]!;
}

export interface CandidateEdge {
  id: string;
  reverseId: string | null;
  name: string | null;
  coordinates: [number, number][];
}

/**
 * Edges a feed hazard lies on. An edge matches when its midpoint is within `maxM` of the feed
 * geometry and (for directional hazards on a line) it runs within 50° of the feed direction, so a
 * jam on one carriageway or a cross street at an intersection is not picked up. Points match the
 * nearest edge. Non-directional hazards (closures, flooding) also take the reverse twin.
 */
export function matchEdges(h: Pick<FeedHazard, 'coordinates' | 'directional'>, candidates: readonly CandidateEdge[], maxM: number): string[] {
  const ids = new Set<string>();
  const byId = new Map(candidates.map((c) => [c.id, c] as const));
  if (h.coordinates.length === 1) {
    let best: CandidateEdge | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = nearestOnLine(h.coordinates[0]!, c.coordinates).d;
      if (d <= maxM && (d < bestD || (d === bestD && best && c.id < best.id))) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      ids.add(best.id);
      if (!h.directional && best.reverseId && byId.has(best.reverseId)) ids.add(best.reverseId);
    }
    return [...ids].sort();
  }
  for (const c of candidates) {
    const first = c.coordinates[0]!;
    const last = c.coordinates[c.coordinates.length - 1]!;
    // The edge must follow the feed line along its length (samples at 25/50/75%), not merely touch
    // it: a side street meeting the line at a junction, or running beside it, is not on it.
    const samples = [0.25, 0.5, 0.75].map((f) => pointAt(c.coordinates, f));
    const nears = samples.map((p) => nearestOnLine(p, h.coordinates));
    if (nears.some((n) => n.d > maxM)) continue;
    const near = nears[1]!;
    const aligned = angleBetween(bearing(first, last), near.brg) <= 50;
    if (h.directional && !aligned) continue;
    if (!h.directional && !aligned && angleBetween(bearing(last, first), near.brg) > 50) continue;
    ids.add(c.id);
    if (!h.directional && c.reverseId && byId.has(c.reverseId)) ids.add(c.reverseId);
  }
  return [...ids].sort();
}
