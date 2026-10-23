import { snapToEdge } from '@vighnaway/engine';
import type { LatLng } from '@vighnaway/contracts';
import { tripEnv } from '@/hooks/useDemoTrip';
import { buildScene } from '@/lib/scene';
import { graphFor, GRAPH_FILE } from '@/lib/scenario';

/**
 * The part of the report form that needs the road graph (about 10 MB): the picker map's scene and the nearest road to
 * a pin. It is its own module so the form can fetch it after the page has appeared, not with it.
 */
export function loadReportGraph(scenarioId: string) {
  const scene = { ...buildScene(tripEnv(scenarioId), GRAPH_FILE, null, { phase: 'idle', flashOn: false, change: null }), origin: null };
  return {
    scene,
    /** The road nearest a point, its name, and how far it is. */
    nearestTo(point: LatLng): { distanceM: number; name: string } | null {
      const graph = graphFor('foot');
      const snap = snapToEdge(graph, point);
      return snap ? { distanceM: snap.distanceM, name: graph.edges[graph.edgeIndex.get(snap.edgeId)!]?.name ?? '' } : null;
    },
  };
}

export type ReportGraph = ReturnType<typeof loadReportGraph>;
