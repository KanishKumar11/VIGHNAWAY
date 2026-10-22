import type { GraphFile, Place, Scenario } from '@vighnaway/contracts';
import graphJson from '../andheri/graph.json';
import placesJson from '../andheri/places.json';
import scenarioJson from '../andheri/scenario.json';
import floodProneJson from '../andheri/flood-prone.json';
import liveScenarioJson from '../andheri/scenario.live.json';

/**
 * Andheri data shared by the phone, the console and the API seed. The phone and console bundle
 * it, so every surface plans on the same graph version.
 */
export const andheriGraph = graphJson as unknown as GraphFile;
export const andheriPlaces = placesJson as unknown as Place[];
export const andheriScenario = scenarioJson as unknown as Scenario;
export const andheriFloodProne = floodProneJson as { description: string; wayIds: string[]; osmWayIds: string[] };

/** Live mode: real user reports, operators and the TomTom feed; never labelled Simulated. */
export const andheriLiveScenario = liveScenarioJson as unknown as Scenario;

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
