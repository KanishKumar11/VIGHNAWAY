import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip } from '@vighnaway/engine';
const car = loadGraph(andheriGraph, 'car');
const origin = process.argv[2]!;
const dest = andheriScenario.places.find((p) => p.id === process.argv[3]!)!;
const p = planTrip({ graph: car, origin, destination: dest.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
p.routes.slice(0, 3).forEach((r, i) => {
  let cum = 0; let last = ''; const parts: string[] = [];
  for (const id of r.edgeIds) {
    const e = car.edges[car.edgeIndex.get(id)!]!;
    const g = e.geometry[0]!; cum += e.lengthM;
    const tag = `${e.name ?? '-'}`;
    if (tag !== last) { parts.push(`${Math.round(cum - e.lengthM)}m ${tag} @${g[1].toFixed(4)},${g[0].toFixed(4)}`); last = tag; }
  }
  console.log(`## ${i} ${r.name}\n  ` + parts.join('\n  '));
});
