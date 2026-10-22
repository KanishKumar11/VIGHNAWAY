// Measures planTrip on the Andheri graph and on a synthetic grid sized like an OSM extract of a
// 4 km x 3 km area (about 5,000 nodes). Node.js timings; Hermes on a phone is slower and must be
// measured on the device (debug screen).
import { loadGraph, planTrip } from '../src';
import { andheriGraph, gridGraph, incident, place, rainAlert } from '../test/helpers';

function time(label: string, fn: () => unknown, runs = 5) {
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  console.log(`${label}: median ${t[Math.floor(runs / 2)]!.toFixed(1)} ms, max ${t[runs - 1]!.toFixed(1)} ms`);
}

const car = loadGraph(andheriGraph, 'car');
let n = 0;
time('andheri fixture planTrip (cold memo per run)', () =>
  planTrip({ graph: car, origin: place('origin-marol').nodeId, destination: place('hosp-kokilaben').nodeId, incidents: [incident({ type: 'flood', depth: 'ankle', edgeIds: [car.edges[n++]!.id] })], nowS: n, ...rainAlert }),
);

const grid = gridGraph(72, 54, 60);
const g = loadGraph(grid, 'car');
console.log(`grid: ${g.nodeIds.length} nodes, ${g.edges.length} edges`);
let k = 0;
time(
  'grid planTrip 4.3 km x 3.2 km (new endpoints each run, no cache)',
  () => {
    k++;
    return planTrip({ graph: g, origin: `g${k}_${k}`, destination: `g${70 - k}_${50 - k}`, incidents: [], nowS: k, ...rainAlert });
  },
  5,
);
