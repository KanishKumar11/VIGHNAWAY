import type { Incident, Scenario } from '@vighnaway/contracts';
import { loadGraph, snapToEdge } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';

const raw = loadGraph(andheriGraph, 'foot');

/** Affected edges like the API: snapped edge, its twin, same-named edges within the radius. */
export function extentFor(point: { lat: number; lng: number }, type: string): { edgeIds: string[]; road: string | null } {
  const snap = snapToEdge(raw, point)!;
  const e = raw.edges[raw.edgeIndex.get(snap.edgeId)!]!;
  const radius = type === 'congestion' ? 600 : 60;
  const ids = new Set<string>([e.baseId]);
  if (e.reverseIdx >= 0) ids.add(raw.edges[e.reverseIdx]!.baseId);
  if (e.name) {
    for (const other of raw.edges) {
      if (other.virtual || other.name !== e.name) continue;
      const s = snapToEdge(raw, point, [other.id]);
      if (s && s.distanceM <= radius) ids.add(other.baseId);
    }
  }
  return { edgeIds: [...ids].sort(), road: e.name };
}

export function makeIncident(over: Partial<Incident> & Pick<Incident, 'id' | 'type' | 'point'>): Incident {
  const ext = extentFor(over.point, over.type);
  return {
    scenarioId: andheriScenario.id,
    status: 'unverified',
    source: 'simulated',
    depth: null,
    congestion: null,
    severity: null,
    impassable: over.type === 'closure',
    conflicting: false,
    edgeIds: ext.edgeIds,
    roadName: ext.road,
    reportCount: 1,
    deviceCount: 1,
    createdAtS: 0,
    lastReportAtS: 0,
    updatedAtS: 0,
    verifiedAtS: null,
    verifiedBy: null,
    closedAtS: null,
    linkedIncidentId: null,
    note: null,
    seq: 1,
    ...over,
  };
}

export const scenarioEvent = (scenario: Scenario, id: string) => {
  const ev = scenario.events.find((e) => e.id === id);
  if (!ev || ev.kind !== 'report') throw new Error(`no report event ${id}`);
  return ev;
};
