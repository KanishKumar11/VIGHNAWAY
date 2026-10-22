import { z } from 'zod';

/** WGS84 point. Every surface uses { lat, lng }; graph geometry uses [lng, lat] tuples. */
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

/** [lng, lat], GeoJSON order, used for compact edge geometry. */
export const LngLatTupleSchema = z.tuple([z.number(), z.number()]);
export type LngLatTuple = z.infer<typeof LngLatTupleSchema>;

export const PROFILES = ['car', 'two_wheeler', 'foot', 'step_free'] as const;
export const ProfileSchema = z.enum(PROFILES);
export type Profile = z.infer<typeof ProfileSchema>;

/** Simulation time: whole seconds since the scenario clock started. Never wall-clock time. */
export const SimSecondsSchema = z.number().int().min(0);

export const IdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:._-]+$/, 'ids use letters, digits and : . _ -');
