import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph } from '@vighnaway/engine';
const car = loadGraph(andheriGraph, 'car');
for (const id of ['hosp-hbt', 'hosp-holy-spirit', 'hosp-kokilaben']) {
  const d = andheriScenario.places.find((p) => p.id === id)!;
  const ni = car.nodeIndex.get(d.nodeId)!;
  const ins = car.edges.filter((e) => e.to === ni && !e.virtual);
  console.log(id, d.nodeId, 'in-edges:', ins.map((e) => `${e.id} ${e.name} ${e.highway} ${Math.round(e.lengthM)}m ${JSON.stringify(e.geometry[Math.floor(e.geometry.length / 2)])}`));
}
