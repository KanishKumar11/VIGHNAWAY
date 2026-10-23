import type { Place, Scenario } from '@vighnaway/contracts';
import { andheriLiveScenario, andheriScenario } from '@vighnaway/scenario-data/scenarios';

/**
 * The bundled scenarios, without the road graph. Anything that only needs a scenario's name, mode,
 * clock or places imports this, so the page does not download the 10 MB graph; lib/scenario.ts adds the graph.
 * - andheri-monsoon: the scripted, simulated demo (everything labelled Simulated);
 * - andheri-live: live mode (user reports, operators and the TomTom feed; wall clock).
 * SCENARIO is the simulated demo, the default and the one /debug hashes.
 */
export const SCENARIO: Scenario = andheriScenario;
export const LIVE_SCENARIO: Scenario = andheriLiveScenario;
export const SCENARIOS: Readonly<Record<string, Scenario>> = { [SCENARIO.id]: SCENARIO, [LIVE_SCENARIO.id]: LIVE_SCENARIO };
export const SCENARIO_ID = SCENARIO.id;
/** The graph is OpenStreetMap data (graphAttribution says the same for an OSM graph file). */
export const ATTRIBUTION = 'Road data © OpenStreetMap contributors';

/** A known scenario id, or the simulated demo. */
export const scenarioFor = (id: string | null | undefined): Scenario => (id && SCENARIOS[id]) || SCENARIO;
export const isLiveScenario = (s: Pick<Scenario, 'mode'>): boolean => s.mode === 'live';

export const placeById = (id: string, scenario: Scenario = SCENARIO): Place | undefined => scenario.places.find((p) => p.id === id);
