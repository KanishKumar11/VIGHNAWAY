// Prints the engine parity hash and the plan hash after every step of the demo replay, so a change
// to engine output can be checked against a recorded baseline. Run:
//   pnpm --filter @vighnaway/scenario-data hashes
import { parityHash } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '../src/index';
import { replayScenario } from './replay';

const parity = parityHash(andheriGraph, andheriScenario);
console.log(`parity ${parity.hash} (${parity.caseCount} cases)`);
const { log } = replayScenario(andheriScenario, andheriGraph);
for (const l of log) if (l.hash) console.log(`${l.atS} ${l.kind} ${l.hash}`);
