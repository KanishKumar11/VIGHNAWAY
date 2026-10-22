import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findForbiddenWords } from '@vighnaway/contracts';
import { loadGraph } from '@vighnaway/engine';
import { andheriGraph } from '../src';
import { DEFAULT_SEEDS, generateScenario, prng, renderScoreboard, runScoreboard, SCOREBOARD_LABEL, scoreboardJson } from '../scripts/scoreboard';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs');

describe('scenario scoreboard (P1-6)', () => {
  it('the seeded generator is deterministic and uses real edges', () => {
    const graph = loadGraph(andheriGraph, 'car');
    const a = generateScenario(3, graph);
    expect(generateScenario(3, graph)).toEqual(a);
    expect(generateScenario(4, graph)).not.toEqual(a);
    const last = a.steps[a.steps.length - 1]!;
    expect(last.incidents.length).toBeGreaterThan(0);
    const base = new Set(graph.edges.map((e) => e.baseId));
    for (const step of a.steps) for (const inc of step.incidents) for (const id of inc.edgeIds) expect(base.has(id)).toBe(true);
    // Times never go backwards, and statuses only ever come from the report ladder and operator actions.
    expect(a.steps.map((s) => s.atS)).toEqual([...a.steps.map((s) => s.atS)].sort((x, y) => x - y));
  });

  it('the generator is the only place with randomness: prng repeats for a seed', () => {
    const r1 = prng(7);
    const r2 = prng(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    expect(prng(8)()).not.toBe(prng(7)());
  });

  it('two runs with the same seeds give byte-identical output', () => {
    const seeds = [1, 2, 3];
    const a = runScoreboard(undefined, undefined, seeds);
    const b = runScoreboard(undefined, undefined, seeds);
    expect(scoreboardJson(a)).toBe(scoreboardJson(b));
    expect(renderScoreboard(a)).toBe(renderScoreboard(b));
  });

  it('the committed report matches a fresh run (run pnpm scoreboard after changing the engine, the data or the generator)', () => {
    const fresh = runScoreboard();
    expect(readFileSync(resolve(docs, 'scoreboard.md'), 'utf8').replace(/\r\n/g, '\n')).toBe(renderScoreboard(fresh));
    expect(readFileSync(resolve(docs, 'scoreboard.json'), 'utf8').replace(/\r\n/g, '\n')).toBe(scoreboardJson(fresh));
    expect(fresh.seeds).toEqual([...DEFAULT_SEEDS]);
  }, 120_000);

  it('labels every figure as simulated and modelled, lists unfavourable cases, and promises nothing', () => {
    const b = runScoreboard();
    const text = renderScoreboard(b);
    expect(text).toContain(SCOREBOARD_LABEL);
    expect(text).toContain('## Unfavourable scenarios');
    // The set includes cases where the recommendation is slower although no hard block stood on the usual route.
    expect(b.summary.slowerNoBlock).toBeGreaterThan(0);
    for (const x of b.results.filter((r) => r.slowerNoBlock)) expect(text).toContain(`Seed ${x.seed},`);
    expect(findForbiddenWords(text)).toEqual([]);
    expect(text).not.toMatch(/saved lives|safest|guarantee|\d+ ?% (of )?(safe|safety)/i);
    expect(text).toContain('reported as a result');
  }, 120_000);
});
