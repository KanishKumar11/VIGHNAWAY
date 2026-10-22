import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip, snapToEdge } from '@vighnaway/engine';

const car = loadGraph(andheriGraph, 'car');
const dest = andheriScenario.places.find((p) => p.id === 'hosp-kokilaben')!;
const origins: Array<[string, number, number]> = [
  ['Marol', 19.10856, 72.87864],
  ['AndheriEast-Sahar', 19.1128, 72.8620],
  ['Chakala', 19.1130, 72.8680],
  ['Telli', 19.1167, 72.8528],
  ['JB Nagar', 19.1140, 72.8720],
];
for (const [label, lat, lng] of origins) {
  const s = snapToEdge(car, { lat, lng });
  if (!s) { console.log(label, 'no snap'); continue; }
  const e = car.edges[car.edgeIndex.get(s.edgeId)!]!;
  const p = planTrip({ graph: car, origin: e.to, destination: dest.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
  console.log(`== ${label} snap ${s.distanceM.toFixed(0)}m on ${e.name} node ${e.to}`);
  for (const r of p.routes) console.log(`  ${r.role.padEnd(12)} ${r.name.padEnd(45)} ${(r.etaS / 60).toFixed(1)} min ${r.distanceM} m  crossings: ${r.crossings.map((c: any) => `${c.name}[${c.kind}]`).join(', ')}`);
}
