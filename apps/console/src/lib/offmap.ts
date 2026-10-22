import type { OffMapReport, ReportType } from '@vighnaway/contracts';

/** Reports within about this distance of a cluster's first report join it (0.003 degrees is roughly 330 m). */
export const CLUSTER_CELL_DEG = 0.003;

export interface OffMapCluster {
  /** Cell key, stable for the same reports. */
  key: string;
  count: number;
  /** Mean position of its reports. */
  lat: number;
  lng: number;
  latestS: number;
  types: ReportType[];
}

/**
 * Groups off-map reports into map cells so an operator sees "4 reports here" rather than 4 rows. A display aid only:
 * off-map reports never become incidents, so nothing here can affect a route. Largest cluster first, then newest.
 */
export function clusterOffMap(reports: readonly OffMapReport[]): OffMapCluster[] {
  const cells = new Map<string, OffMapReport[]>();
  for (const r of reports) {
    const key = `${Math.floor(r.point.lat / CLUSTER_CELL_DEG)}:${Math.floor(r.point.lng / CLUSTER_CELL_DEG)}`;
    const list = cells.get(key);
    if (list) list.push(r);
    else cells.set(key, [r]);
  }
  return [...cells.entries()]
    .map(([key, list]) => ({
      key,
      count: list.length,
      lat: list.reduce((s, r) => s + r.point.lat, 0) / list.length,
      lng: list.reduce((s, r) => s + r.point.lng, 0) / list.length,
      latestS: Math.max(...list.map((r) => r.receivedAtS)),
      types: [...new Set(list.map((r) => r.type))].sort(),
    }))
    .sort((a, b) => b.count - a.count || b.latestS - a.latestS || (a.key < b.key ? -1 : 1));
}
