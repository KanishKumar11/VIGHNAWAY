import { z } from 'zod';
import { LngLatTupleSchema } from './primitives';

export const RoadNodeSchema = z.object({
  id: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
});
export type RoadNode = z.infer<typeof RoadNodeSchema>;

/**
 * One directed edge per travel direction. Two-way roads produce two edges with reversed
 * geometry; `reverseId` links the twins. Geometry is stored in the direction of travel.
 */
export const RoadEdgeSchema = z.object({
  /** Stable id `u-v-key` derived from OSM node ids (or fixture ids). */
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  reverseId: z.string().nullable(),
  wayId: z.string(),
  name: z.string().nullable(),
  highway: z.string(),
  oneway: z.boolean(),
  junction: z.string().nullable(),
  bridge: z.boolean(),
  tunnel: z.boolean(),
  layer: z.number().int(),
  access: z.string().nullable(),
  foot: z.string().nullable(),
  motorVehicle: z.string().nullable(),
  lengthM: z.number().nonnegative(),
  floodProne: z.boolean(),
  /** OpenStreetMap lit=yes/no (P2-9). Absent or null where the map does not say; the Andheri extract carries it on about 2% of ways. */
  lit: z.boolean().nullable().optional(),
  geometry: z.array(LngLatTupleSchema).min(2),
});
export type RoadEdge = z.infer<typeof RoadEdgeSchema>;

export const GraphSourceSchema = z.enum(['osm', 'schematic-fixture']);
export type GraphSource = z.infer<typeof GraphSourceSchema>;

export const GraphFileSchema = z.object({
  graphVersion: z.string().min(1),
  source: GraphSourceSchema,
  /** Text that must be shown wherever this graph's data appears. */
  attribution: z.string(),
  generatedBy: z.string(),
  bbox: z.object({ south: z.number(), west: z.number(), north: z.number(), east: z.number() }),
  /**
   * Optional typical speeds (km/h) per profile and road class, for a region where the engine's
   * default table (an illustrative Mumbai monsoon table) does not apply. Absent = the engine table.
   * A road class missing here falls back to the engine table.
   */
  speedsKmh: z.record(z.string(), z.record(z.string(), z.number().positive())).optional(),
  nodes: z.array(RoadNodeSchema),
  edges: z.array(RoadEdgeSchema),
});
export type GraphFile = z.infer<typeof GraphFileSchema>;
