#!/usr/bin/env node
/**
 * Extracts the "north corridor" road graph (Amritsar, Jalandhar, Ludhiana, Rajpura, Ambala) and a
 * small place index from OpenStreetMap for VIGHNAWAY, so the phone can plan real routes outside
 * Andheri with the same engine. Roads only: no incidents, no simulated data exist for this region.
 *
 *   node apps/mobile/scripts/extract-corridor.mjs            # fetch from Overpass, write the files
 *   node apps/mobile/scripts/extract-corridor.mjs --check    # verify the committed files only
 *
 * Writes apps/mobile/src/regions/north/graph.json and places.json. Never hand-edit them; change
 * this script and re-run it. Needs network access to an Overpass API mirror and `pnpm build`
 * (it validates against @vighnaway/contracts).
 *
 * Graph rules (mirrors scripts/extract_graph.py where it applies):
 *  - highways motorway, trunk, primary, secondary and their links within RADIUS_M of the corridor line;
 *  - one directed edge per travel direction, stable ids "u-v-key" from OSM node ids, geometry stored
 *    in the direction of travel, lengthM from the geometry (haversine);
 *  - motorways, motorway links and roundabouts are one-way unless tagged oneway=no;
 *  - largest connected component only;
 *  - bridge, tunnel and layer are not extracted (every flag false): this region is about distance
 *    and time, and hundreds of highway bridges would drown the route strip in "flyover" chips;
 *  - speeds: typical free-flow km/h per road class (SPEEDS_KMH), carried in the file as
 *    `speedsKmh` because the engine's default table is a monsoon-traffic table for Mumbai.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'regions', 'north');

/** Amritsar, Jalandhar, Ludhiana, Sirhind, Rajpura, Ambala. */
const LINE = [
  [31.634, 74.873],
  [31.326, 75.576],
  [30.901, 75.857],
  [30.64, 76.38],
  [30.48, 76.59],
  [30.378, 76.776],
];
const RADIUS_M = 15000;
const HIGHWAYS = 'motorway|trunk|primary|secondary';
const PLACE_KINDS = 'city|town|village';
/** Around every city and town, the tertiary and unclassified streets too, so a start or end is properly connected. */
const LOCAL_HIGHWAYS = 'tertiary|unclassified';
const LOCAL_RADIUS_M = 3500;

/** Typical free-flow speeds (km/h) by road class. Not measurements; shown as "typical". */
const SPEEDS_KMH = {
  car: { motorway: 80, motorway_link: 50, trunk: 60, trunk_link: 40, primary: 50, primary_link: 35, secondary: 40, secondary_link: 30, tertiary: 30, tertiary_link: 25, unclassified: 25 },
  two_wheeler: { motorway: 55, motorway_link: 40, trunk: 50, trunk_link: 35, primary: 45, primary_link: 32, secondary: 38, secondary_link: 28, tertiary: 30, tertiary_link: 25, unclassified: 25 },
  foot: { default: 4.5 },
};

const MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, label) {
  let lastError = 'no attempt';
  for (let round = 0; round < 4; round++) {
    for (const url of MIRRORS) {
      try {
        const t0 = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'vighnaway-corridor/0.1 (prototype; contact: dev team)' },
          body: 'data=' + encodeURIComponent(query),
        });
        if (!res.ok) {
          lastError = `${url} HTTP ${res.status}`;
          continue;
        }
        const json = await res.json();
        console.log(`${label}: ${json.elements.length} elements from ${new URL(url).host} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        return json.elements;
      } catch (e) {
        lastError = `${url} ${e.message}`;
      }
    }
    console.log(`${label}: retrying after ${lastError}`);
    await sleep(5000 * 2 ** round);
  }
  throw new Error(`Overpass failed: ${lastError}`);
}

const line = LINE.map((p) => p.join(',')).join(',');

const rad = (d) => (d * Math.PI) / 180;
function haversineM(a, b) {
  const R = 6371008.8;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

function onewayOf(tags) {
  const o = tags.oneway;
  if (o === 'no' || o === 'false' || o === '0') return 'both';
  if (o === '-1' || o === 'reverse') return 'reverse';
  if (o === 'yes' || o === 'true' || o === '1') return 'forward';
  if (tags.junction === 'roundabout' || tags.highway === 'motorway' || tags.highway === 'motorway_link') return 'forward';
  return 'both';
}

function roadName(tags) {
  const name = tags['name:en'] || tags.name || null;
  const ref = tags.ref ? String(tags.ref).split(';')[0].trim() : null;
  if (name && ref) return name.includes(ref) ? name : `${name} (${ref})`;
  return name || ref || null;
}

function buildGraph(ways, nodeAt) {
  // 1. Which nodes are vertices: way ends, and nodes used by two or more ways (or twice by one).
  const use = new Map();
  for (const w of ways) {
    w.nodes.forEach((id, i) => {
      const ends = i === 0 || i === w.nodes.length - 1 ? 2 : 0;
      use.set(id, (use.get(id) ?? 0) + 1 + ends);
    });
  }
  const point = new Map();
  const nodes = new Map();
  const edges = [];
  const pairCount = new Map();
  for (const w of ways) {
    const tags = w.tags;
    const dir = onewayOf(tags);
    const ids = w.nodes.map(String);
    if (ids.some((id) => !nodeAt.has(id))) continue;
    const geom = ids.map((id) => nodeAt.get(id));
    ids.forEach((id, i) => point.set(id, { lat: geom[i].lat, lng: geom[i].lng }));
    let start = 0;
    for (let i = 1; i < ids.length; i++) {
      if (i !== ids.length - 1 && (use.get(Number(ids[i])) ?? 0) < 2) continue;
      const a = ids[start];
      const b = ids[i];
      const pts = [];
      for (let k = start; k <= i; k++) pts.push({ lat: geom[k].lat, lng: geom[k].lng });
      start = i;
      if (a === b) continue;
      let lengthM = 0;
      for (let k = 1; k < pts.length; k++) lengthM += haversineM(pts[k - 1], pts[k]);
      const tuples = pts.map((p) => [round5(p.lng), round5(p.lat)]);
      const [x, y] = a < b ? [a, b] : [b, a];
      const pair = `${x}-${y}`;
      const key = pairCount.get(pair) ?? 0;
      pairCount.set(pair, key + 1);
      const common = {
        wayId: String(w.id),
        name: roadName(tags),
        highway: tags.highway,
        junction: tags.junction ?? null,
        bridge: false,
        tunnel: false,
        layer: 0,
        access: tags.access ?? null,
        foot: tags.foot ?? null,
        motorVehicle: tags.motor_vehicle ?? null,
        lengthM: Math.round(lengthM * 10) / 10,
        floodProne: false,
      };
      nodes.set(a, point.get(a));
      nodes.set(b, point.get(b));
      const fwd = { id: `${a}-${b}-${key}`, from: a, to: b, geometry: tuples };
      const rev = { id: `${b}-${a}-${key}`, from: b, to: a, geometry: [...tuples].reverse() };
      if (dir === 'both') {
        edges.push({ ...fwd, reverseId: rev.id, oneway: false, ...common });
        edges.push({ ...rev, reverseId: fwd.id, oneway: false, ...common });
      } else if (dir === 'forward') {
        edges.push({ ...fwd, reverseId: null, oneway: true, ...common });
      } else {
        edges.push({ ...rev, reverseId: null, oneway: true, ...common });
      }
    }
  }
  return { nodes, edges };
}

/** Largest weakly connected component, so no pocket of roads is unreachable. */
function largestComponent({ nodes, edges }) {
  const adj = new Map();
  for (const id of nodes.keys()) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  }
  const seen = new Set();
  let best = [];
  for (const id of nodes.keys()) {
    if (seen.has(id)) continue;
    const comp = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const n = stack.pop();
      comp.push(n);
      for (const m of adj.get(n)) if (!seen.has(m)) (seen.add(m), stack.push(m));
    }
    if (comp.length > best.length) best = comp;
  }
  const keep = new Set(best);
  return {
    nodes: new Map([...nodes].filter(([id]) => keep.has(id))),
    edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

/**
 * Largest strongly connected component (every node can reach every other along one-way rules).
 * A plain connected component keeps one-way pockets and dead-end slip roads, which would snap a
 * start or destination onto a node with no sensible way in or out. Iterative Kosaraju.
 */
function largestStrongComponent({ nodes, edges }) {
  const out = new Map();
  const back = new Map();
  for (const id of nodes.keys()) (out.set(id, []), back.set(id, []));
  for (const e of edges) (out.get(e.from).push(e.to), back.get(e.to).push(e.from));
  const order = [];
  const seen = new Set();
  for (const root of nodes.keys()) {
    if (seen.has(root)) continue;
    const stack = [[root, 0]];
    seen.add(root);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = out.get(top[0])[top[1]++];
      if (next === undefined) (order.push(top[0]), stack.pop());
      else if (!seen.has(next)) (seen.add(next), stack.push([next, 0]));
    }
  }
  const comp = new Map();
  let best = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const root = order[i];
    if (comp.has(root)) continue;
    const members = [];
    const stack = [root];
    comp.set(root, root);
    while (stack.length) {
      const n = stack.pop();
      members.push(n);
      for (const m of back.get(n)) if (!comp.has(m)) (comp.set(m, root), stack.push(m));
    }
    if (members.length > best.length) best = members;
  }
  const keep = new Set(best);
  return {
    nodes: new Map([...nodes].filter(([id]) => keep.has(id))),
    edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

function summarise(graph) {
  const by = {};
  for (const e of graph.edges) by[e.highway] = (by[e.highway] ?? 0) + 1;
  const bbox = { south: 90, west: 180, north: -90, east: -180 };
  for (const n of graph.nodes) {
    bbox.south = Math.min(bbox.south, n.lat);
    bbox.north = Math.max(bbox.north, n.lat);
    bbox.west = Math.min(bbox.west, n.lng);
    bbox.east = Math.max(bbox.east, n.lng);
  }
  return { by, bbox };
}

async function check() {
  const file = JSON.parse(readFileSync(join(OUT_DIR, 'graph.json'), 'utf8'));
  const { GraphFileSchema } = await import('@vighnaway/contracts');
  const parsed = GraphFileSchema.safeParse(file);
  if (!parsed.success) {
    console.error('graph.json does not match GraphFileSchema', parsed.error.issues.slice(0, 5));
    process.exit(1);
  }
  const ids = new Set(file.nodes.map((n) => n.id));
  const bad = file.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  console.log(`graph.json ok: ${file.nodes.length} nodes, ${file.edges.length} edges, ${bad.length} dangling, version ${file.graphVersion}`);
  if (bad.length) process.exit(1);
}

async function main() {
  if (process.argv.includes('--check')) return check();
  mkdirSync(OUT_DIR, { recursive: true });

  const roads = await overpass(`[out:json][timeout:240];way(around:${RADIUS_M},${line})[highway~"^(${HIGHWAYS})(_link)?$"]->.main;node(around:${RADIUS_M},${line})[place~"^(city|town)$"]->.towns;way(around.towns:${LOCAL_RADIUS_M})[highway~"^(${LOCAL_HIGHWAYS})(_link)?$"]->.local;((.main;.local;);node(w););out body qt;`, 'roads');
  const ways = roads.filter((e) => e.type === 'way' && e.nodes && e.tags?.highway);
  const nodeAt = new Map(roads.filter((e) => e.type === 'node').map((e) => [String(e.id), { lat: e.lat, lng: e.lon }]));
  const raw = buildGraph(ways, nodeAt);
  const g = largestStrongComponent(largestComponent(raw));
  const nodes = [...g.nodes].map(([id, p]) => ({ id, lat: round5(p.lat), lng: round5(p.lng) })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const edges = g.edges.sort((a, b) => (a.id < b.id ? -1 : 1));
  const { by, bbox } = summarise({ nodes, edges });
  const pad = 0.02;
  const body = {
    source: 'osm',
    attribution: 'Road data © OpenStreetMap contributors',
    generatedBy: 'apps/mobile/scripts/extract-corridor.mjs',
    bbox: { south: round5(bbox.south - pad), west: round5(bbox.west - pad), north: round5(bbox.north + pad), east: round5(bbox.east + pad) },
    speedsKmh: SPEEDS_KMH,
    nodes,
    edges,
  };
  const graphVersion = 'osm-' + createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  const graph = { graphVersion, ...body };
  writeFileSync(join(OUT_DIR, 'graph.json'), JSON.stringify(graph));
  console.log(`graph: ${nodes.length} nodes, ${edges.length} edges, ${graphVersion}`, by, graph.bbox);

  const placeEls = await overpass(`[out:json][timeout:120];node(around:${RADIUS_M},${line})[place~"^(${PLACE_KINDS})$"][name];out;`, 'places');
  const seen = new Set();
  const places = [];
  for (const e of placeEls) {
    const name = e.tags['name:en'] || e.tags.name;
    const key = `${name.toLowerCase()}|${e.tags.place}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    places.push({ name, kind: e.tags.place, lat: round5(e.lat), lng: round5(e.lon), population: Number(e.tags.population) || null });
  }
  places.sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || (a.name < b.name ? -1 : 1));
  writeFileSync(join(OUT_DIR, 'places.json'), JSON.stringify(places));
  console.log(`places: ${places.length}`);
  // Small enough to import at start-up: lets the app tell which region a point is in without parsing the graph.
  const meta = { id: 'north', name: 'Amritsar to Ambala', graphVersion, bbox: graph.bbox, nodes: nodes.length, edges: edges.length, places: places.length };
  writeFileSync(join(OUT_DIR, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  if (existsSync(join(OUT_DIR, 'graph.json'))) await check();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
