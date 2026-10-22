import type { Graph } from '@vighnaway/engine';
import { loadGraph } from '@vighnaway/engine';
import type { GraphFile, Place, Profile, Scenario } from '@vighnaway/contracts';
import { andheriGraph, andheriLiveScenario, andheriScenario, graphAttribution } from '@vighnaway/scenario-data';

/**
 * The bundled scenarios: the console plans on the same graph version as the phone.
 * - andheri-monsoon: the scripted, simulated demo (everything labelled Simulated);
 * - andheri-live: live mode (user reports, operators and the TomTom feed; wall clock).
 * SCENARIO is the simulated demo, the default and the one /debug hashes.
 */
export const SCENARIO: Scenario = andheriScenario;
export const LIVE_SCENARIO: Scenario = andheriLiveScenario;
export const SCENARIOS: Readonly<Record<string, Scenario>> = { [SCENARIO.id]: SCENARIO, [LIVE_SCENARIO.id]: LIVE_SCENARIO };
export const GRAPH_FILE: GraphFile = andheriGraph;
export const SCENARIO_ID = SCENARIO.id;
export const ATTRIBUTION = graphAttribution(GRAPH_FILE);

/** A known scenario id, or the simulated demo. */
export const scenarioFor = (id: string | null | undefined): Scenario => (id && SCENARIOS[id]) || SCENARIO;
export const isLiveScenario = (s: Pick<Scenario, 'mode'>): boolean => s.mode === 'live';

const graphs = new Map<Profile, Graph>();
/** Built once per profile and reused (the engine never mutates it). */
export function graphFor(profile: Profile): Graph {
  let g = graphs.get(profile);
  if (!g) {
    g = loadGraph(GRAPH_FILE, profile);
    graphs.set(profile, g);
  }
  return g;
}

export const placeById = (id: string, scenario: Scenario = SCENARIO): Place | undefined => scenario.places.find((p) => p.id === id);
