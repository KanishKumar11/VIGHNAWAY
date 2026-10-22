import { customType } from 'drizzle-orm/pg-core';

/** [lng, lat] in GeoJSON order. */
export type LngLat = [number, number];

export const SRID = 4326;

/**
 * Minimal EWKB (hex) reader for the two geometry types the API stores. PostGIS returns geometry
 * columns as hex EWKB; doubles round-trip exactly, so a point read back equals the point written.
 */
function readEwkb(hex: string): { type: number; coords: LngLat[] } {
  const buf = Buffer.from(hex, 'hex');
  const little = buf.readUInt8(0) === 1;
  let o = 1;
  const rawType = little ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
  o += 4;
  if (rawType & 0x20000000) o += 4; // SRID
  const type = rawType & 0xffff;
  const dbl = (at: number) => (little ? buf.readDoubleLE(at) : buf.readDoubleBE(at));
  if (type === 1) return { type, coords: [[dbl(o), dbl(o + 8)]] };
  if (type === 2) {
    const n = little ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
    o += 4;
    const coords: LngLat[] = [];
    for (let i = 0; i < n; i++) coords.push([dbl(o + i * 16), dbl(o + i * 16 + 8)]);
    return { type, coords };
  }
  throw new Error(`Unsupported geometry type ${type}`);
}

/** EWKT for a point, e.g. `SRID=4326;POINT(72.84 19.11)`. */
export const pointEwkt = ([lng, lat]: LngLat): string => `SRID=${SRID};POINT(${lng} ${lat})`;

export const lineEwkt = (coords: readonly LngLat[]): string =>
  `SRID=${SRID};LINESTRING(${coords.map(([x, y]) => `${x} ${y}`).join(',')})`;

/** geometry(Point, 4326), mapped to [lng, lat]. */
export const pointGeom = customType<{ data: LngLat; driverData: string }>({
  dataType: () => `geometry(Point,${SRID})`,
  toDriver: (v) => pointEwkt(v),
  fromDriver: (v) => readEwkb(v).coords[0]!,
});

/** geometry(LineString, 4326), mapped to [[lng, lat], ...]. */
export const lineStringGeom = customType<{ data: LngLat[]; driverData: string }>({
  dataType: () => `geometry(LineString,${SRID})`,
  toDriver: (v) => lineEwkt(v),
  fromDriver: (v) => readEwkb(v).coords,
});

/** bytea, mapped to a Buffer (postgres.js sends and returns Buffers for bytea). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
