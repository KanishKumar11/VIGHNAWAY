import type { Alert, GraphFile, Incident, RoadEdge, Scenario } from '@vighnaway/contracts';
import graphJson from './fixtures/andheri-graph.json';
import scenarioJson from './fixtures/andheri-scenario.json';

export const andheriGraph = graphJson as unknown as GraphFile;
export const andheriScenario = scenarioJson as unknown as Scenario;
export const place = (id: string) => andheriScenario.places.find((p) => p.id === id)!;

let counter = 0;
export function incident(partial: Partial<Incident> & Pick<Incident, 'type' | 'edgeIds'>): Incident {
  counter++;
  return {
    id: partial.id ?? `t:inc:${String(counter).padStart(4, '0')}`,
    scenarioId: 'test',
    status: 'unverified',
    source: 'simulated',
    depth: null,
    congestion: null,
    severity: null,
    impassable: partial.type === 'closure',
    conflicting: false,
    point: { lat: 19.1, lng: 72.8 },
    roadName: null,
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
    seq: counter,
    ...partial,
  };
}

/** Edge ids (both directions) of every edge on a named way. */
export function edgesNamed(graph: GraphFile, name: string): string[] {
  return graph.edges.filter((e) => e.name === name).map((e) => e.id).sort();
}

/**
 * Synthetic two-way grid for unit tests: (cols x rows) nodes, `spacingM` apart, all residential.
 * Node ids "g{c}_{r}". Optional overrides per undirected edge key "a|b" (sorted ids).
 */
export function gridGraph(
  cols: number,
  rows: number,
  spacingM = 200,
  overrides: Record<string, Partial<RoadEdge>> = {},
): GraphFile {
  const nodes = [];
  const edges: RoadEdge[] = [];
  const lat0 = 19.1;
  const lng0 = 72.85;
  const dLat = spacingM / 110574;
  const dLng = spacingM / 105186;
  const id = (c: number, r: number) => `g${c}_${r}`;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) nodes.push({ id: id(c, r), lat: lat0 + r * dLat, lng: lng0 + c * dLng });
  const pos = new Map(nodes.map((n) => [n.id, n] as const));
  const addPair = (a: string, b: string) => {
    const key = [a, b].sort().join('|');
    const o = overrides[key] ?? {};
    const pa = pos.get(a)!;
    const pb = pos.get(b)!;
    const base = {
      wayId: `w-${key}`,
      name: `Road ${key}`,
      highway: 'residential',
      oneway: false,
      junction: null,
      bridge: false,
      tunnel: false,
      layer: 0,
      access: null,
      foot: null,
      motorVehicle: null,
      lengthM: spacingM,
      floodProne: false,
      ...o,
    };
    const f = `${a}-${b}-0`;
    const rv = `${b}-${a}-0`;
    edges.push({ ...base, id: f, from: a, to: b, reverseId: base.oneway ? null : rv, geometry: [[pa.lng, pa.lat], [pb.lng, pb.lat]] });
    if (!base.oneway) edges.push({ ...base, id: rv, from: b, to: a, reverseId: f, geometry: [[pb.lng, pb.lat], [pa.lng, pa.lat]] });
  };
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      if (c + 1 < cols) addPair(id(c, r), id(c + 1, r));
      if (r + 1 < rows) addPair(id(c, r), id(c, r + 1));
    }
  return {
    graphVersion: `grid-${cols}x${rows}-${spacingM}-${Object.keys(overrides).length}`,
    source: 'schematic-fixture',
    attribution: 'Synthetic test grid',
    generatedBy: 'test',
    bbox: { south: lat0, west: lng0, north: lat0 + rows * dLat, east: lng0 + cols * dLng },
    nodes,
    edges: edges.sort((x, y) => (x.id < y.id ? -1 : 1)),
  };
}

export const noAlerts: { alerts: Alert[]; hasAlertInformation: boolean } = { alerts: [], hasAlertInformation: true };
export const rainAlert: { alerts: Alert[]; hasAlertInformation: boolean } = {
  alerts: [
    { id: 'a1', kind: 'rain', label: 'Rain', source: 'Simulated', simulated: true, activeFromS: 0, activeUntilS: null },
  ],
  hasAlertInformation: true,
};
