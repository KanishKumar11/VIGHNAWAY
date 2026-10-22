// Dev tool: searches origins for a demo trip with three distinctly named routes. Run with --conditions=@vighnaway/source.
import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip } from '@vighnaway/engine';

const car = loadGraph(andheriGraph, 'car');
const destId = process.argv[2] ?? 'hosp-kokilaben';
const dest = andheriScenario.places.find((p) => p.id === destId)!;
const minGap1 = Number(process.argv[3] ?? 150);
const minGap2 = Number(process.argv[4] ?? 120);
const g: any = andheriGraph;
const named = new Map<string, string>();
for (const e of g.edges) if (e.name && ['primary', 'secondary', 'tertiary'].includes(e.highway)) named.set(e.from, e.name);
const out: string[] = [];
let n = 0;
for (const node of g.nodes) {
  if (!named.has(node.id)) continue;
  if (n++ % 3) continue;
  const p = planTrip({ graph: car, origin: node.id, destination: dest.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
  const r = p.routes;
  if (r.length < 3) continue;
  const names = r.slice(0, 3).map((x) => x.name);
  if (new Set(names).size < 3) continue;
  const g1 = r[1]!.etaS - r[0]!.etaS;
  const g2 = r[2]!.etaS - r[1]!.etaS;
  if (g1 < minGap1 || g2 < minGap2 || r[0]!.etaS < 420 || r[0]!.etaS > 1500) continue;
  out.push(`${node.id} (${node.lat.toFixed(4)},${node.lng.toFixed(4)}) ${named.get(node.id)} | ${r.slice(0, 3).map((x) => `${x.name} ${(x.etaS / 60).toFixed(1)}m`).join(' | ')} | gaps ${[g1, g2].map((x) => Math.round(x / 6) / 10)}`);
}
console.log(destId, out.length, 'candidates');
console.log(out.slice(0, 40).join('\n'));
