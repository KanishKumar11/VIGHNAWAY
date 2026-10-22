import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip } from '@vighnaway/engine';
const car = loadGraph(andheriGraph, 'car');
const dest = andheriScenario.places.find((p) => p.id === process.argv[3]!)!;
const p = planTrip({ graph: car, origin: process.argv[2]!, destination: dest.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
const [from, to] = [Number(process.argv[4]), Number(process.argv[5])];
let cum = 0;
for (const id of p.routes[0]!.edgeIds) {
  const e = car.edges[car.edgeIndex.get(id)!]!;
  if (cum + e.lengthM >= from && cum <= to) console.log(`${Math.round(cum)}m ${e.id} ${e.name} ${e.highway} br=${e.bridge} tn=${e.tunnel} l=${e.layer} len=${Math.round(e.lengthM)} mid=${e.geometry[Math.floor(e.geometry.length / 2)]![1].toFixed(5)},${e.geometry[Math.floor(e.geometry.length / 2)]![0].toFixed(5)}`);
  cum += e.lengthM;
}
