import { findForbiddenWords } from '@vighnaway/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '@/i18n/en';

describe('copy rules (DESIGN.md section 9)', () => {
  const values: [string, string][] = Object.entries(en).flatMap(([k, v]): [string, string][] =>
    Array.isArray(v) ? v.map((x, i): [string, string] => [`${k}[${i}]`, String(x)]) : [[k, String(v)]],
  );

  it('no string uses a forbidden word or a safety percentage', () => {
    const bad = values.filter(([, v]) => findForbiddenWords(String(v)).length > 0);
    expect(bad).toEqual([]);
  });

  it('the i18n source file as a whole has no forbidden words', () => {
    const src = readFileSync(join(__dirname, '../src/i18n/en.ts'), 'utf8');
    expect(findForbiddenWords(src)).toEqual([]);
  });

  it('never says "confirmed" for corroboration and has no exclamation marks', () => {
    for (const [k, v] of values) {
      expect([k, /\bconfirmed\b/i.test(String(v)) && !/until confirmed/i.test(String(v))]).toEqual([k, false]);
      expect([k, String(v).includes('!')]).toEqual([k, false]);
    }
  });

  it('labels the scenario as simulated on first run and in shared text', () => {
    expect(en.firstRunBadge).toMatch(/Simulated/);
    expect(en.shareHeader).toMatch(/Simulated/);
    expect(en.notificationTitle).toMatch(/simulated/i);
  });
});
