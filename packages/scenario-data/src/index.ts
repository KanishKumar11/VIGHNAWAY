import type { GraphFile, Scenario } from '@vighnaway/contracts';
import graphJson from '../andheri/graph.json';
import floodProneJson from '../andheri/flood-prone.json';
import { andheriLiveScenario, andheriPlaces, andheriScenario } from './scenarios';

/**
 * Andheri data shared by the phone, the console and the API seed. The phone and console bundle
 * it, so every surface plans on the same graph version.
 */
export { andheriLiveScenario, andheriPlaces, andheriScenario };
export const andheriGraph = graphJson as unknown as GraphFile;
export const andheriFloodProne = floodProneJson as { description: string; wayIds: string[]; osmWayIds: string[] };

// The scenarios and places are in ./scenarios, which does not pull in the 10 MB graph: pages that only need them import that.
export const scenarios: Record<string, { scenario: Scenario; graph: GraphFile }> = {
  [andheriScenario.id]: { scenario: andheriScenario, graph: andheriGraph },
  [andheriLiveScenario.id]: { scenario: andheriLiveScenario, graph: andheriGraph },
};

export function getScenarioBundle(id: string): { scenario: Scenario; graph: GraphFile } | null {
  return scenarios[id] ?? null;
}

/** Text to show wherever this graph's data appears. */
export function graphAttribution(graph: GraphFile): string {
  return graph.source === 'osm' ? 'Road data © OpenStreetMap contributors' : graph.attribution;
}
