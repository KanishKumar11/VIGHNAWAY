import type { Graph } from '@vighnaway/engine';
import { loadGraph } from '@vighnaway/engine';
import type { GraphFile, Profile } from '@vighnaway/contracts';
import { andheriGraph } from '@vighnaway/scenario-data';

/**
 * The scenarios plus the road graph. Importing this pulls the whole graph (about 10 MB) into the page, so
 * only code that really plans or draws roads should: everything else imports lib/scenarios.ts.
 */
export * from './scenarios';

export const GRAPH_FILE: GraphFile = andheriGraph;

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
