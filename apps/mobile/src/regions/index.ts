import type { GraphFile, LatLng } from '@vighnaway/contracts';
import { andheriGraph } from '@vighnaway/scenario-data';
import northMeta from './north/meta.json';

/**
 * Map regions the phone can plan routes in. Andheri is the scenario graph (with incidents, the
 * simulation and the live feed). North is a roads-only corridor from Amritsar to Ambala extracted
 * from OpenStreetMap by scripts/extract-corridor.mjs: real roads and distances, no incident data.
 * One trip lives in one region; the engine plans on that region's graph.
 */
export type RegionId = 'andheri' | 'north';

export const REGION_IDS: readonly RegionId[] = ['andheri', 'north'];

/** A point this far outside a region's box (about 330 m) still counts as inside. */
const BBOX_MARGIN_DEG = 0.003;

export interface NorthPlace {
  name: string;
  kind: 'city' | 'town' | 'village';
  lat: number;
  lng: number;
  population: number | null;
}

type Box = GraphFile['bbox'];

const boxes: Record<RegionId, Box> = { andheri: andheriGraph.bbox, north: northMeta.bbox };

export const regionBox = (id: RegionId): Box => boxes[id];

export function insideBox(b: Box, p: LatLng, margin = BBOX_MARGIN_DEG): boolean {
  return p.lat >= b.south - margin && p.lat <= b.north + margin && p.lng >= b.west - margin && p.lng <= b.east + margin;
}

/** The region whose map covers a point, or null when the point is outside every region. */
export function regionOfPoint(p: LatLng): RegionId | null {
  for (const id of REGION_IDS) if (insideBox(boxes[id], p)) return id;
  return null;
}

/** The graph of a region. The corridor graph (about 11 MB) is only parsed when first needed. */
export function graphForRegion(id: RegionId): GraphFile {
  if (id === 'andheri') return andheriGraph;
  return northGraph();
}

let north: GraphFile | null = null;
function northGraph(): GraphFile {
  // A lazy require keeps the large JSON from being evaluated at app start.
  north ??= require('./north/graph.json') as GraphFile;
  return north;
}

let northPlaceList: NorthPlace[] | null = null;
/** Cities, towns and villages along the corridor, most populous first. */
export function northPlaces(): readonly NorthPlace[] {
  northPlaceList ??= require('./north/places.json') as NorthPlace[];
  return northPlaceList;
}

export const NORTH_GRAPH_VERSION: string = northMeta.graphVersion;
