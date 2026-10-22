// Prints initial A/B/C ETAs and a replay of the scenario. Run: pnpm --filter @vighnaway/scenario-data tune
import { formatSimClock } from '@vighnaway/contracts';
import { andheriGraph, andheriScenario } from '../src/index';
import { replayScenario } from './replay';

const { log, initialPlan } = replayScenario(andheriScenario, andheriGraph);
console.log('Initial routes:');
for (const r of initialPlan.routes) {
  console.log(`  ${r.role.padEnd(14)} ${r.name.padEnd(40)} eta ${String(r.etaS).padStart(5)} s  cost ${String(r.costS).padStart(5)}  ${r.distanceM} m  conf ${r.explanation.confidence}`);
  console.log(`      ${r.explanation.reason} | ${r.explanation.tradeOff} | ${r.explanation.recheckIf}`);
}
for (const l of log) {
  console.log(`${formatSimClock(andheriScenario.clockStartsAt, l.atS, true)} [${l.kind}] rec=${l.recommended} eta=${l.etaS} veh=${l.vehicleRoadName}\n    ${l.text}`);
}
