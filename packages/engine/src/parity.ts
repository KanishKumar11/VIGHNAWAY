import type { GraphFile, Incident, Profile, Scenario } from '@vighnaway/contracts';
import { PROFILES } from '@vighnaway/contracts';
import type { Graph } from './graph';
import { loadGraph, snapToEdge } from './graph';
import { hashValue } from './hash';
import { planTrip } from './plan';

/**
 * Parity check: the phone's hidden debug screen and the console's /debug page both call this and
 * show the hash. They must match, or the two screens could disagree on stage.
 *
 * The fixture set is built only from the scenario file: every report event becomes an incident on
 * the edge it snaps to, in three evidence states, and each state is planned for every profile at
 * several simulation times.
 */
export function parityCases(graphFile: GraphFile, scenario: Scenario): { label: string; hash: string }[] {
  const graphs = new Map<Profile, Graph>(PROFILES.map((p) => [p, loadGraph(graphFile, p)] as const));
  const snapGraph = graphs.get('foot')!;
  const origin = scenario.places.find((p) => p.id === scenario.demoTrip.originId)!;
  const dest = scenario.places.find((p) => p.id === scenario.demoTrip.destinationId)!;

  const reports = scenario.events.filter((e) => e.kind === 'report');
  const build = (status: Incident['status'], upTo: number): Incident[] =>
    reports.slice(0, upTo).flatMap((e, i) => {
      const snap = snapToEdge(snapGraph, e.report.point);
      if (!snap || e.report.type === 'road_clear') return [];
      const edge = snapGraph.edges[snapGraph.edgeIndex.get(snap.edgeId)!]!;
      const edgeIds = [edge.baseId];
      if (edge.reverseIdx >= 0) edgeIds.push(snapGraph.edges[edge.reverseIdx]!.baseId);
      const inc: Incident = {
        id: `parity:${String(i).padStart(2, '0')}`,
        scenarioId: scenario.id,
        type: e.report.type,
        status,
        source: 'simulated',
        depth: e.report.type === 'flood' ? e.report.depth ?? null : null,
        congestion: e.report.type === 'congestion' ? e.report.congestion ?? null : null,
        severity: e.report.severity ?? null,
        impassable: e.report.type === 'closure' || !!e.report.impassable,
        conflicting: false,
        edgeIds: [...new Set(edgeIds)].sort(),
        point: e.report.point,
        roadName: edge.name,
        reportCount: 1,
        deviceCount: status === 'corroborated' ? 2 : 1,
        createdAtS: e.atS,
        lastReportAtS: e.atS,
        updatedAtS: e.atS,
        verifiedAtS: status === 'verified' ? e.atS : null,
        verifiedBy: status === 'verified' ? 'simulated_operator' : null,
        closedAtS: null,
        linkedIncidentId: null,
        note: null,
        seq: i + 1,
      };
      return [inc];
    });

  const cases: { label: string; hash: string }[] = [];
  for (const profile of PROFILES) {
    const graph = graphs.get(profile)!;
    for (const status of ['unverified', 'corroborated', 'verified'] as const) {
      for (let upTo = 0; upTo <= reports.length; upTo++) {
        for (const nowS of [0, 3600, 4 * 3600]) {
          const plan = planTrip({
            graph,
            origin: origin.nodeId,
            destination: dest.nodeId,
            incidents: build(status, upTo),
            nowS,
            alerts: scenario.alerts,
            hasAlertInformation: scenario.hasAlertInformation,
            places: scenario.places,
            destinationPlaceId: dest.id,
          });
          cases.push({ label: `${profile}/${status}/${upTo}/${nowS}`, hash: hashValue(plan) });
        }
      }
    }
  }
  return cases;
}

/** Single hash over every parity case. */
export function parityHash(graphFile: GraphFile, scenario: Scenario): { hash: string; caseCount: number } {
  const cases = parityCases(graphFile, scenario);
  return { hash: hashValue(cases), caseCount: cases.length };
}
