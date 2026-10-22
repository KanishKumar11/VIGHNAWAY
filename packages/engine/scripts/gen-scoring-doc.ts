// Generates docs/scoring.md from SCORING_RULES so documentation never drifts from code.
// Run: pnpm docs:scoring (CI checks the committed file is up to date via the engine test suite).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScoringDoc } from '../test/scoring-doc';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'scoring.md');
writeFileSync(out, renderScoringDoc());
console.log(`wrote ${out}`);
