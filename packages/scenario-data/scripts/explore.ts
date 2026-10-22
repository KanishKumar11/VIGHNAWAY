// Dev tool: plans between scenario places on the real graph and prints the routes. Run with --conditions=@vighnaway/source.
import { andheriGraph, andheriScenario } from '../src/index';
import { loadGraph, planTrip } from '@vighnaway/engine';

const car = loadGraph(andheriGraph, 'car');
const place = (id: string) => andheriScenario.places.find((p) => p.id === id)!;
const pairs: Array<[string, string]> = (process.argv[2] ?? 'origin-marol:hosp-kokilaben').split(',').map((s) => s.split(':') as [string, string]);
for (const [o, d] of pairs) {
  const p = planTrip({ graph: car, origin: place(o).nodeId, destination: place(d).nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
  console.log(`== ${o} -> ${d}: ${p.routes.length} routes`);
  for (const r of p.routes) {
    console.log(`  ${r.role.padEnd(12)} ${String(r.name).padEnd(50)} ${(r.etaS / 60).toFixed(1)} min ${r.distanceM} m  crossings: ${r.crossings.map((c: any) => `${c.name}[${c.kind}]`).join(', ')}`);
  }
}
