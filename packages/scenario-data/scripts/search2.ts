// Dev tool: origins whose three routes share a long common start (so reroutes can still happen mid-trip).
import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip } from '@vighnaway/engine';
const car = loadGraph(andheriGraph, 'car');
const destId = process.argv[2] ?? 'hosp-holy-spirit';
const dest = andheriScenario.places.find((p) => p.id === destId)!;
const g: any = andheriGraph;
const named = new Map<string, string>();
for (const e of g.edges) if (e.name && ['primary', 'secondary', 'tertiary', 'residential'].includes(e.highway)) named.set(e.from, e.name);
const out: string[] = [];
let n = 0;
for (const node of g.nodes) {
  if (!named.has(node.id)) continue;
  if (n++ % 4) continue;
  const p = planTrip({ graph: car, origin: node.id, destination: dest.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
  const r = p.routes;
  if (r.length < 3) continue;
  if (new Set(r.slice(0, 3).map((x) => x.name)).size < 3) continue;
  const g1 = r[1]!.etaS - r[0]!.etaS, g2 = r[2]!.etaS - r[1]!.etaS;
  if (g1 < 150 || g2 < 120 || r[0]!.etaS < 600 || r[0]!.etaS > 1500) continue;
  let common = 0, dist = 0;
  const ids = r.slice(0, 3).map((x) => x.edgeIds);
  for (let i = 0; i < ids[0]!.length; i++) {
    if (ids[1]![i] !== ids[0]![i] || ids[2]![i] !== ids[0]![i]) break;
    dist += car.edges[car.edgeIndex.get(ids[0]![i]!)!]!.lengthM;
  }
  common = dist / r[0]!.distanceM;
  out.push(`${common.toFixed(2)} ${node.id} (${node.lat.toFixed(4)},${node.lng.toFixed(4)}) ${named.get(node.id)} | ${r.slice(0, 3).map((x) => `${x.name} ${(x.etaS / 60).toFixed(1)}m`).join(' | ')} | gaps ${[g1, g2].map((x) => Math.round(x / 6) / 10)}`);
}
out.sort().reverse();
console.log(destId, out.length);
console.log(out.slice(0, 25).join('\n'));
