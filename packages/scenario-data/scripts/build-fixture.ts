/**
 * Builds the SCHEMATIC FIXTURE graph for Andheri, Mumbai, plus places, the flood-prone list and
 * the simulated scenario. Run: pnpm graph:fixture
 *
 * Why this exists: scripts/extract_graph.py builds the real graph from OpenStreetMap with osmnx,
 * but it needs network access to Overpass. This fixture lets every package run and be tested
 * offline. Its geometry is hand-drawn and approximate: road names and the rough layout follow
 * Andheri (Western Railway line, Andheri Subway, Gokhale Bridge, Jogeshwari road over-bridge,
 * Western Express Highway), but positions are only indicative and will not line up exactly with
 * the Google basemap. graph.json is labelled source "schematic-fixture" and every surface shows
 * that instead of the OpenStreetMap attribution. Replace it with the OSM extract before any demo
 * that overlays routes on the real map.
 *
 * Never hand-edit the generated JSON: change this script and regenerate.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GraphFile, LngLatTuple, Place, RoadEdge, Scenario } from '@vighnaway/contracts';
import { GraphFileSchema, ScenarioSchema } from '@vighnaway/contracts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'andheri');

// Local frame: metres east (x) and north (y) of this anchor, near Andheri Subway.
const LAT0 = 19.115;
const LNG0 = 72.845;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const toLngLat = ([x, y]: XY): LngLatTuple => [round6(LNG0 + x / M_PER_DEG_LNG), round6(LAT0 + y / M_PER_DEG_LAT)];

type XY = [number, number];

/** Junction nodes. Ids are stable fixture ids, not OSM ids. */
const NODES: Record<string, XY> = {
  // East of the railway
  MAROL: [3800, -320],
  AK1: [2700, -170],
  AK2: [2100, -90],
  WEH_AK: [1250, 20],
  AK3: [800, 90],
  AK4: [500, 130],
  SUB_E: [300, 150],
  SUB_W: [20, 150],
  WEH_S: [1250, -700],
  WEH_OND: [1250, 1300],
  WEH_MCR: [1250, 1750],
  WEH_JV: [1250, 2800],
  WEH_N: [1250, 3300],
  OND1: [880, 1050],
  OND2: [660, 760],
  GB_E: [520, 520],
  SRE_F: [690, 560],
  JR1: [1000, 2790],
  JR2: [720, 2780],
  JROB_E: [560, 2780],
  JROB_W: [240, 2780],
  JV_HBT: [1600, 2830],
  JV_E: [2600, 2870],
  MCR1: [1800, 1780],
  MCR_HSP: [2100, 1800],
  MCR2: [2400, 1830],
  // West of the railway
  SV_S: [-160, -400],
  SV_A: [-105, 150],
  GB_W: [-40, 490],
  SV_B: [-71, 490],
  SV_F: [-50, 700],
  SV_2: [0, 1200],
  SV_3: [65, 1850],
  SV_C: [158, 2780],
  SV_N: [210, 3300],
  JP1: [-600, 800],
  JP2: [-1200, 1250],
  JP3: [-1750, 1650],
  FOUR_BUNGALOWS: [-2050, 1830],
  KDAH: [-2150, 1960],
  VD1: [-700, 1420],
  RR1: [-500, 2280],
  RR2: [-1100, 2200],
  NLR_N: [-1600, 2150],
  NLR_1: [-1800, 2000],
};

interface Way {
  key: string;
  name: string | null;
  highway: string;
  oneway?: boolean;
  bridge?: boolean;
  tunnel?: boolean;
  layer?: number;
  floodProne?: boolean;
  foot?: string;
  /** Node keys and intermediate [x, y] shape points. */
  path: (string | XY)[];
}

const WAYS: Way[] = [
  { key: 'akr', name: 'Andheri-Kurla Road', highway: 'primary', path: ['MAROL', 'AK1', 'AK2', 'WEH_AK', [1000, 55], 'AK3', 'AK4', 'SUB_E'] },
  { key: 'sub', name: 'Andheri Subway', highway: 'secondary', tunnel: true, layer: -1, floodProne: true, path: ['SUB_E', [165, 150], 'SUB_W'] },
  { key: 'subw', name: 'Andheri Subway Road', highway: 'secondary', path: ['SUB_W', 'SV_A'] },
  { key: 'weh', name: 'Western Express Highway', highway: 'trunk', path: ['WEH_S', 'WEH_AK', 'WEH_OND', 'WEH_MCR', 'WEH_JV', 'WEH_N'] },
  {
    key: 'ond',
    name: 'Old Nagardas Road',
    highway: 'residential',
    path: ['WEH_OND', [1150, 1330], [1080, 1390], [990, 1330], [1020, 1250], [960, 1150], 'OND1', [800, 980], [760, 880], 'OND2', [600, 650], 'GB_E'],
  },
  { key: 'ppr', name: 'Parsi Panchayat Road', highway: 'residential', oneway: true, path: ['OND2', [600, 420], [540, 250], 'AK4'] },
  { key: 'gb', name: 'Gokhale Bridge', highway: 'primary', bridge: true, layer: 1, path: ['GB_E', [330, 505], [160, 495], 'GB_W'] },
  { key: 'gbw', name: 'Gokhale Road', highway: 'primary', path: ['GB_W', 'SV_B'] },
  { key: 'sre', name: 'Station Road East', highway: 'residential', path: ['GB_E', 'SRE_F'] },
  { key: 'fob', name: 'Andheri Station Footbridge', highway: 'footway', bridge: true, layer: 1, path: ['SRE_F', [250, 680], 'SV_F'] },
  { key: 'jva', name: 'Jogeshwari Station Road', highway: 'residential', path: ['WEH_JV', [1180, 2900], [1080, 2850], 'JR1', [960, 2960], [860, 2990], [800, 2820], 'JR2', [680, 2930], [600, 2900], 'JROB_E'] },
  { key: 'jrob', name: 'Jogeshwari Road Over Bridge', highway: 'tertiary', bridge: true, layer: 1, path: ['JROB_E', [428, 2780], 'JROB_W'] },
  { key: 'jrw', name: 'Jogeshwari Station Road', highway: 'residential', path: ['JROB_W', 'SV_C'] },
  { key: 'jvlr', name: 'Jogeshwari-Vikhroli Link Road', highway: 'primary', path: ['WEH_JV', 'JV_HBT', 'JV_E'] },
  { key: 'mcr', name: 'Mahakali Caves Road', highway: 'secondary', path: ['WEH_MCR', 'MCR1', 'MCR_HSP', 'MCR2'] },
  { key: 'svr', name: 'S.V. Road', highway: 'primary', path: ['SV_S', 'SV_A', 'SV_B', 'SV_F', 'SV_2', 'SV_3', 'SV_C', 'SV_N'] },
  { key: 'jpr', name: 'J.P. Road', highway: 'secondary', path: ['SV_B', 'JP1', 'JP2', 'JP3', 'FOUR_BUNGALOWS'] },
  { key: 'vdr', name: 'Veera Desai Road', highway: 'secondary', path: ['SV_2', 'VD1', 'JP3'] },
  { key: 'rlf', name: 'Relief Road', highway: 'residential', path: ['SV_C', [-60, 2700], [-250, 2560], [-380, 2470], 'RR1', [-700, 2350], [-820, 2480], [-980, 2240], 'RR2', [-1250, 2400], [-1380, 2200], [-1450, 2120], 'NLR_N'] },
  { key: 'nlr', name: 'New Link Road', highway: 'secondary', path: ['NLR_N', 'NLR_1', 'FOUR_BUNGALOWS'] },
  { key: 'kda', name: 'Rao Saheb Achyutrao Patwardhan Marg', highway: 'service', path: ['FOUR_BUNGALOWS', 'KDAH'] },
];

const nodeKeys = Object.keys(NODES).sort();
const nodeId = (key: string) => `fx${String(nodeKeys.indexOf(key) + 1).padStart(3, '0')}`;

function haversine(a: LngLatTuple, b: LngLatTuple): number {
  const R = 6371008.8;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b[1] - a[1]);
  const dLng = r(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const edges: RoadEdge[] = [];
const floodProneWayIds: string[] = [];
WAYS.forEach((w, wi) => {
  const wayId = `fx-way-${100 + wi}`;
  if (w.floodProne) floodProneWayIds.push(wayId);
  // Split the way at junction nodes.
  const segments: { from: string; to: string; geom: LngLatTuple[] }[] = [];
  let current: { from: string; geom: LngLatTuple[] } | null = null;
  for (const p of w.path) {
    if (typeof p === 'string') {
      const pt = toLngLat(NODES[p]!);
      if (current) {
        current.geom.push(pt);
        segments.push({ from: current.from, to: p, geom: current.geom });
      }
      current = { from: p, geom: [pt] };
    } else if (current) {
      current.geom.push(toLngLat(p));
    }
  }
  for (const s of segments) {
    let lengthM = 0;
    for (let i = 1; i < s.geom.length; i++) lengthM += haversine(s.geom[i - 1]!, s.geom[i]!);
    const u = nodeId(s.from);
    const v = nodeId(s.to);
    const base = {
      wayId,
      name: w.name,
      highway: w.highway,
      oneway: !!w.oneway,
      junction: null,
      bridge: !!w.bridge,
      tunnel: !!w.tunnel,
      layer: w.layer ?? 0,
      access: null,
      foot: w.foot ?? null,
      motorVehicle: null,
      lengthM: Math.round(lengthM * 10) / 10,
      floodProne: !!w.floodProne,
    };
    const fwdId = `${u}-${v}-0`;
    const revId = `${v}-${u}-0`;
    edges.push({ ...base, id: fwdId, from: u, to: v, reverseId: w.oneway ? null : revId, geometry: s.geom });
    if (!w.oneway) {
      edges.push({ ...base, id: revId, from: v, to: u, reverseId: fwdId, geometry: [...s.geom].reverse() });
    }
  }
});
edges.sort((a, b) => (a.id < b.id ? -1 : 1));

const nodes = nodeKeys.map((k) => {
  const [lng, lat] = toLngLat(NODES[k]!);
  return { id: nodeId(k), lat, lng };
});

const lats = nodes.map((n) => n.lat);
const lngs = nodes.map((n) => n.lng);
const body = { nodes, edges };
const graphVersion = `fixture-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12)}`;
const graph: GraphFile = GraphFileSchema.parse({
  graphVersion,
  source: 'schematic-fixture',
  attribution: 'Schematic road fixture drawn for testing, not OpenStreetMap data. Positions are approximate.',
  generatedBy: 'packages/scenario-data/scripts/build-fixture.ts',
  bbox: {
    south: Math.min(...lats) - 0.002,
    west: Math.min(...lngs) - 0.002,
    north: Math.max(...lats) + 0.002,
    east: Math.max(...lngs) + 0.002,
  },
  nodes,
  edges,
});

const place = (
  id: string,
  name: string,
  kind: Place['kind'],
  node: string,
  side: 'east' | 'west',
  address: string | null,
  offset: XY = [0, 0],
): Place => {
  const [x, y] = NODES[node]!;
  const [lng, lat] = toLngLat([x + offset[0], y + offset[1]]);
  return { id, name, kind, point: { lat, lng }, nodeId: nodeId(node), side, address };
};

const places: Place[] = [
  place('origin-marol', 'Marol Naka, Andheri East', 'origin', 'MAROL', 'east', 'Andheri-Kurla Road'),
  place('hosp-kokilaben', 'Kokilaben Dhirubhai Ambani Hospital', 'hospital', 'KDAH', 'west', 'Four Bungalows, Andheri West', [-30, 25]),
  place('hosp-hbt', 'HBT Trauma Care Hospital', 'hospital', 'JV_HBT', 'east', 'Jogeshwari-Vikhroli Link Road, Jogeshwari East', [0, 35]),
  place('hosp-holy-spirit', 'Holy Spirit Hospital', 'hospital', 'MCR_HSP', 'east', 'Mahakali Caves Road, Andheri East', [0, 35]),
];

// Scenario points: on the road centreline at a fraction of a way's path.
const at = (a: string, b: string, t: number) => {
  const [ax, ay] = NODES[a]!;
  const [bx, by] = NODES[b]!;
  const [lng, lat] = toLngLat([ax + (bx - ax) * t, ay + (by - ay) * t]);
  return { lat, lng };
};
const subwayPoint = (() => {
  const [lng, lat] = toLngLat([165, 150]);
  return { lat, lng };
})();
const ondPoint = (() => {
  const [lng, lat] = toLngLat([960, 1150]);
  return { lat, lng };
})();

const MIN = 60;
const scenario: Scenario = ScenarioSchema.parse({
  id: 'andheri-monsoon',
  name: 'Andheri monsoon evening (simulated)',
  area: 'Andheri, Mumbai',
  mode: 'simulated',
  simulated: true,
  timezone: 'Asia/Kolkata',
  clockStartsAt: '2026-07-14T14:05:00+05:30',
  simSecondsPerRealSecond: 10,
  graphVersion,
  hasAlertInformation: true,
  alerts: [
    {
      id: 'alert-rain-1',
      kind: 'rain',
      label: 'Heavy rain alert for Mumbai suburbs (simulated)',
      source: 'Simulated alert, not from IMD',
      simulated: true,
      activeFromS: 0,
      activeUntilS: null,
    },
  ],
  places,
  demoTrip: {
    profile: 'car',
    originId: 'origin-marol',
    destinationId: 'hosp-kokilaben',
    alternativeDestinationIds: ['hosp-hbt', 'hosp-holy-spirit'],
    vehicleSpeedFactor: 1,
    startTripAtS: 0,
  },
  events: [
    {
      id: 'ev01-ankle',
      atS: 1 * MIN,
      kind: 'report',
      label: 'Ankle-deep water reported at Andheri Subway (simulated device A)',
      report: { type: 'flood', depth: 'ankle', point: subwayPoint, observedPersonally: true, deviceId: 'sim-device-a', description: 'Water collecting at the subway entrance' },
    },
    {
      id: 'ev02-knee',
      atS: 3 * MIN,
      kind: 'report',
      label: 'Knee-deep water reported at Andheri Subway by a second device (simulated device B)',
      report: { type: 'flood', depth: 'knee', point: subwayPoint, observedPersonally: true, deviceId: 'sim-device-b', description: 'Water up to the knee, cars stalling' },
    },
    {
      id: 'ev03-verify',
      atS: 4 * MIN + 30,
      kind: 'verify',
      label: 'Simulated operator verifies the Andheri Subway flooding',
      targetEventId: 'ev02-knee',
    },
    {
      id: 'ev04-congestion-a',
      atS: 6 * MIN,
      kind: 'report',
      label: 'Heavy congestion reported on Old Nagardas Road towards Gokhale Bridge (simulated device C)',
      report: { type: 'congestion', congestion: 'heavy', point: ondPoint, observedPersonally: true, deviceId: 'sim-device-c' },
    },
    {
      id: 'ev05-congestion-b',
      atS: 6 * MIN + 10,
      kind: 'report',
      label: 'Second device reports the same congestion (simulated device D)',
      report: { type: 'congestion', congestion: 'heavy', point: ondPoint, observedPersonally: true, deviceId: 'sim-device-d' },
    },
    {
      id: 'ev06-closure',
      atS: 8 * MIN,
      kind: 'report',
      label: 'Road into Kokilaben Hospital reported closed (simulated device E)',
      report: { type: 'closure', point: at('FOUR_BUNGALOWS', 'KDAH', 0.5), observedPersonally: true, deviceId: 'sim-device-e', description: 'Barricades across the hospital road' },
    },
    {
      id: 'ev07-verify-closure',
      atS: 8 * MIN + 10,
      kind: 'verify',
      label: 'Simulated operator verifies the hospital road closure',
      targetEventId: 'ev06-closure',
    },
  ],
});

/**
 * Live mode: same graph and places (ids prefixed, since place ids are global), no scripted
 * events, no alert information (so no data-gap penalty: "No rain alert information"), and a clock
 * that the API derives from wall time (seconds since clockStartsAt, so formatSimClock shows IST).
 * Incidents come from real user reports, operators and the TomTom live-traffic feed.
 */
const livePlaces: Place[] = places.map((p) => ({ ...p, id: `live-${p.id}` }));
const liveScenario: Scenario = ScenarioSchema.parse({
  id: 'andheri-live',
  name: 'Andheri live',
  area: 'Andheri, Mumbai',
  mode: 'live',
  simulated: false,
  timezone: 'Asia/Kolkata',
  clockStartsAt: '2026-01-01T00:00:00+05:30',
  simSecondsPerRealSecond: 1,
  graphVersion,
  hasAlertInformation: false,
  alerts: [],
  places: livePlaces,
  demoTrip: {
    profile: 'car',
    originId: 'live-origin-marol',
    destinationId: 'live-hosp-kokilaben',
    alternativeDestinationIds: ['live-hosp-hbt', 'live-hosp-holy-spirit'],
    vehicleSpeedFactor: 1,
    startTripAtS: 0,
  },
  events: [],
});

mkdirSync(OUT, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(join(OUT, name), JSON.stringify(value, null, 1) + '\n');
write('graph.json', graph);
write('places.json', places);
write('flood-prone.json', {
  description:
    'Way ids treated as flood-prone in addition to tunnels and negative layers under the railway. wayIds: schematic fixture ways. osmWayIds: hand-maintained OSM way ids of named low-lying roads, read by scripts/extract_graph.py (fill in after checking the map).',
  wayIds: floodProneWayIds,
  osmWayIds: [],
});
write('scenario.json', scenario);
write('scenario.live.json', liveScenario);
console.log(`graph ${graphVersion}: ${nodes.length} nodes, ${edges.length} edges -> ${OUT}`);
