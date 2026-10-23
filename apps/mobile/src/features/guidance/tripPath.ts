import type { Graph } from '@vighnaway/engine';
import { buildGuidePath, type GuidePath, type GuidePoint } from './guide';
import type { AccessLeg } from './localRoads';

/**
 * The whole trip as one path: the local road from the start to the road network, the route's edges,
 * and the local road from the network to the destination. A leg joins only when the route really
 * begins (or ends) at the node it was found for; after a re-plan from the middle of the trip the
 * start leg is behind the traveller and is left out.
 */
export function tripGuidePath(graph: Graph, edgeIds: readonly string[], from: AccessLeg | null, to: AccessLeg | null): GuidePath {
  const pts: GuidePoint[] = [];
  const edges = edgeIds.map((id) => graph.edges[graph.edgeIndex.get(id) ?? -1]).filter((e): e is NonNullable<typeof e> => !!e);
  const first = edges[0];
  const last = edges[edges.length - 1];
  if (from && first && graph.nodeIds[first.from] === from.entryNodeId) pts.push(...from.points);
  for (const e of edges) {
    e.geometry.forEach(([lng, lat], i) => pts.push({ lat, lng, junction: i === 0 ? true : undefined, name: i === 0 ? (e.name ?? null) : undefined }));
  }
  if (to && last && graph.nodeIds[last.to] === to.entryNodeId) pts.push(...to.points);
  return buildGuidePath(pts);
}
