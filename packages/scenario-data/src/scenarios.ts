import type { Place, Scenario } from '@vighnaway/contracts';
import placesJson from '../andheri/places.json';
import scenarioJson from '../andheri/scenario.json';
import liveScenarioJson from '../andheri/scenario.live.json';

/**
 * The Andheri scenarios and places on their own, without the road graph (about 10 MB). A page that
 * only needs a scenario's names, clock or mode imports this, so it does not download the graph.
 */
export const andheriPlaces = placesJson as unknown as Place[];
export const andheriScenario = scenarioJson as unknown as Scenario;

/** Live mode: real user reports, operators and the TomTom feed; never labelled Simulated. */
export const andheriLiveScenario = liveScenarioJson as unknown as Scenario;
