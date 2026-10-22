import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip } from '@vighnaway/engine';
const car = loadGraph(andheriGraph, 'car');
const dest = andheriScenario.places.find((p) => p.id === process.argv[3]!)!;
const p = planTrip({ graph: car, origin: process.argv[2]!, destination: dest.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
const [from, to] = [Number(process.argv[4]), Number(process.argv[5])];
const raw: any = andheriGraph;
const byId = new Map<string, any>(raw.edges.map((e: any) => [e.id, e]));
let cum = 0; const ways = new Map<string, number>();
for (const id of p.routes[0]!.edgeIds) {
  const e = byId.get(id);
  if (cum >= from && cum <= to) ways.set(e.wayId, (ways.get(e.wayId) ?? 0) + e.lengthM);
  cum += e.lengthM;
}
console.log([...ways.entries()].map(([w, l]) => `${w}:${Math.round(l)}m`).join('\n'));
