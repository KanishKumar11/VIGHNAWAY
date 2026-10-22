// Dev tool: prints each route's roads and the edges unique to it, to place scenario events. Run with --conditions=@vighnaway/source.
import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip } from '@vighnaway/engine';

const car = loadGraph(andheriGraph, 'car');
const origin = process.argv[2]!;
const dest = andheriScenario.places.find((p) => p.id === (process.argv[3] ?? 'hosp-hbt'))!;
const p = planTrip({ graph: car, origin, destination: dest.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
const sets = p.routes.map((r) => new Set(r.edgeIds.map((id) => id.replace(/-\d+$/, ''))));
p.routes.slice(0, 4).forEach((r, i) => {
  console.log(`\n## ${i} ${r.role} ${r.name} ${(r.etaS / 60).toFixed(1)}m ${r.distanceM}m roads: ${r.roadNames.join(' > ')}`);
  const others = sets.filter((_, j) => j !== i && j < 4);
  let run: { name: string | null; len: number; first: any; mid: any } | null = null;
  const flush = () => { if (run && run.len > 150) console.log(`   unique ${String(run.name).padEnd(40)} ${Math.round(run.len)} m at ${run.mid[1].toFixed(5)},${run.mid[0].toFixed(5)}`); run = null; };
  for (const id of r.edgeIds) {
    const e = car.edges[car.edgeIndex.get(id)!]!;
    const key = id.replace(/-\d+$/, '');
    const unique = others.every((s) => !s.has(key));
    if (!unique) { flush(); continue; }
    const m = e.geometry[Math.floor(e.geometry.length / 2)]!;
    if (run && run.name === e.name) { run.len += e.lengthM; run.mid = m; } else { flush(); run = { name: e.name, len: e.lengthM, first: m, mid: m }; }
  }
  flush();
});
