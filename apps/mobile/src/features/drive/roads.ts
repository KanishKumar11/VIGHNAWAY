import type { Graph } from '@vighnaway/engine';

/**
 * The road the vehicle is on and the next differently named road ahead, from the route's edges.
 * Unnamed edges are skipped. Before a trip starts, "current" is the first named road of the route.
 */
export function roadsAhead(graph: Graph, edgeIds: readonly string[], index = 0): { current: string | null; next: string | null } {
  const nameAt = (i: number): string | null => {
    const e = graph.edges[graph.edgeIndex.get(edgeIds[i]!) ?? -1];
    return e?.name ?? null;
  };
  let current: string | null = null;
  let i = Math.max(0, index);
  for (; i < edgeIds.length; i++) {
    current = nameAt(i);
    if (current) break;
  }
  for (let j = i + 1; j < edgeIds.length; j++) {
    const n = nameAt(j);
    if (n && n !== current) return { current, next: n };
  }
  return { current, next: null };
}
