import type { GraphFile, LatLng, Place } from '@vighnaway/contracts';
import { haversineM } from '@vighnaway/engine';

/**
 * Offline place search over what the app already ships: the scenario's places (hospitals, the demo
 * start) and every named road of the bundled OpenStreetMap graph. Nothing here is a router and no
 * network is used; a result is only a point that the engine later snaps to a graph node.
 */
export type SearchKind = 'hospital' | 'shelter' | 'landmark' | 'origin' | 'road';

export interface SearchEntry {
  /** Scenario place id, or `road:{edgeId}` for a road. */
  id: string;
  name: string;
  /** Address of a place; empty for roads (the sheet labels them "Road"). */
  subtitle: string;
  kind: SearchKind;
  point: LatLng;
  nodeId: string;
  /** Normalised haystack: name and address, lower case, without accents or punctuation. */
  haystack: string;
  /** Prefix of the normalised name, for ranking exact starts first. */
  nameKey: string;
}

/** Road names that say nothing about where they are. */
const GENERIC_ROAD = /^(service road|slip road|unnamed.*|link road|road)$/i;

export const normalise = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

interface RoadAcc {
  name: string;
  /** Edge midpoints with their lengths, to pick the edge nearest the road's centre. */
  parts: { edgeId: string; from: string; point: LatLng; lengthM: number }[];
}

const roadCache = new WeakMap<GraphFile, SearchEntry[]>();

/** One entry per named road, placed on the edge nearest the road's length-weighted centre. */
function roadEntries(file: GraphFile): SearchEntry[] {
  const cached = roadCache.get(file);
  if (cached) return cached;
  const byName = new Map<string, RoadAcc>();
  for (const e of file.edges) {
    const name = e.name?.trim();
    if (!name || GENERIC_ROAD.test(name) || e.geometry.length === 0) continue;
    const mid = e.geometry[Math.floor(e.geometry.length / 2)]!;
    let acc = byName.get(name);
    if (!acc) byName.set(name, (acc = { name, parts: [] }));
    acc.parts.push({ edgeId: e.id, from: e.from, point: { lat: mid[1], lng: mid[0] }, lengthM: Math.max(1, e.lengthM) });
  }
  const out: SearchEntry[] = [];
  for (const { name, parts } of byName.values()) {
    const total = parts.reduce((s, p) => s + p.lengthM, 0);
    const centre = {
      lat: parts.reduce((s, p) => s + p.point.lat * p.lengthM, 0) / total,
      lng: parts.reduce((s, p) => s + p.point.lng * p.lengthM, 0) / total,
    };
    let best = parts[0]!;
    let bestD = Infinity;
    for (const p of parts) {
      const d = haversineM(centre, p.point);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const key = normalise(name);
    out.push({ id: `road:${best.edgeId}`, name, subtitle: '', kind: 'road', point: best.point, nodeId: best.from, haystack: key, nameKey: key });
  }
  roadCache.set(file, out);
  return out;
}

const placeKind = (p: Place): SearchKind => p.kind;

export function placeEntries(places: readonly Place[]): SearchEntry[] {
  return places.map((p) => {
    const key = normalise(p.name);
    return {
      id: p.id,
      name: p.name,
      subtitle: p.address ?? '',
      kind: placeKind(p),
      point: p.point,
      nodeId: p.nodeId,
      haystack: p.address ? `${key} ${normalise(p.address)}` : key,
      nameKey: key,
    };
  });
}

/** Scenario places first, then roads (the order also breaks ranking ties). */
export function buildGazetteer(file: GraphFile, places: readonly Place[]): SearchEntry[] {
  return [...placeEntries(places), ...roadEntries(file)];
}

const KIND_ORDER: Record<SearchKind, number> = { hospital: 0, shelter: 1, landmark: 2, origin: 3, road: 4 };

/** Rank of a match: 0 name starts with the query, 1 every word starts a word, 2 contained; null = no match. */
function matchRank(entry: SearchEntry, query: string, tokens: string[]): number | null {
  if (entry.nameKey.startsWith(query)) return 0;
  const words = entry.haystack.split(' ');
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) return 1;
  if (query.length >= 3 && entry.haystack.includes(query)) return 2;
  return null;
}

/**
 * Matches the query against names and addresses. An empty query lists the scenario's places (the
 * suggestions). `near` only orders equal matches, nearest first.
 */
export function searchEntries(entries: readonly SearchEntry[], rawQuery: string, near?: LatLng | null, limit = 40): SearchEntry[] {
  const query = normalise(rawQuery.slice(0, 80));
  if (query === '') return entries.filter((e) => e.kind !== 'road').sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const tokens = query.split(' ');
  const hits: { entry: SearchEntry; rank: number; d: number }[] = [];
  for (const entry of entries) {
    const rank = matchRank(entry, query, tokens);
    if (rank !== null) hits.push({ entry, rank, d: near ? haversineM(near, entry.point) : 0 });
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
      a.d - b.d ||
      a.entry.name.localeCompare(b.entry.name),
  );
  return hits.slice(0, limit).map((h) => h.entry);
}

/** The scenario place for an entry, or a session-only place for a road. */
export function entryToPlace(entry: SearchEntry, scenarioPlaces: readonly Place[]): Place {
  const known = scenarioPlaces.find((p) => p.id === entry.id);
  if (known) return known;
  return { id: entry.id, name: entry.name, kind: 'landmark', point: entry.point, nodeId: entry.nodeId, side: null, address: null };
}
