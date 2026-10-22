import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderScoringDoc } from './scoring-doc';
import { parityHash } from '../src';
import { andheriGraph, andheriScenario } from './helpers';

describe('generated documentation', () => {
  it('docs/scoring.md matches SCORING_RULES (run pnpm docs:scoring)', () => {
    const committed = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'scoring.md'), 'utf8');
    expect(committed).toBe(renderScoringDoc());
  });
});

describe('parity hash', () => {
  it('is stable across repeated runs', () => {
    const a = parityHash(andheriGraph, andheriScenario);
    const b = parityHash(andheriGraph, andheriScenario);
    expect(a).toEqual(b);
    expect(a.caseCount).toBeGreaterThan(50);
    // Printed so it can be compared with the phone debug screen and the console /debug page.
    console.log(`parity hash ${a.hash} over ${a.caseCount} cases`);
  });
});
